import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { applyPendingWhatsAppStatus } from "@/lib/whatsapp-status";
import { checkWorkspacePlanLimit, reserveWorkspaceMessageUsage, releaseWorkspaceMessageUsage } from "@/lib/plan-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  let leaseCollection;
  let leaseKey;
  let leaseOwner;

  try {
    const db = await getDatabase();
    const workerNow = new Date();
    await db.collection("campaigns").updateMany(
      { status: "scheduled", scheduledAt: { $lte: workerNow } },
      { $set: { status: "queued", activatedAt: workerNow, updatedAt: workerNow } },
    );
    let campaign = await db.collection("campaigns").findOneAndUpdate(
      { status: "queued" },
      { $set: { status: "sending", sendingStartedAt: new Date(), updatedAt: new Date() } },
      { sort: { queuedAt: 1 }, returnDocument: "after" },
    );
    if (!campaign) campaign = await db.collection("campaigns").findOne({ status: "sending" });
    if (!campaign) return NextResponse.json({ success: true, processed: 0, message: "No queued campaigns." });

    const account = await db.collection("whatsappAccounts").findOne({ workspaceId: campaign.workspaceId, status: "connected" });
    if (!account?.phoneNumberId || !account?.accessTokenEncrypted) {
      await db.collection("campaigns").updateOne({ _id: campaign._id, status: "sending" }, { $set: { status: "paused", pauseReason: "WhatsApp account disconnected.", updatedAt: new Date() } });
      return NextResponse.json({ success: false, message: "Campaign paused: WhatsApp account disconnected." }, { status: 409 });
    }

    const liveCampaign = await db.collection("campaigns").findOne({
      _id: campaign._id,
      workspaceId: campaign.workspaceId,
      status: "sending",
    });
    if (!liveCampaign) {
      return NextResponse.json({ success: true, processed: 0, message: "Campaign is no longer sending." });
    }

    // Serialize all sends through the same WhatsApp phone number, even when
    // multiple campaigns or cron invocations target it concurrently.
    // A short cooldown between leases provides conservative per-number pacing.
    leaseCollection = db.collection("whatsappWorkerLeases");
    leaseKey = String(account.phoneNumberId);
    leaseOwner = randomUUID();
    const leaseNow = new Date();
    try {
      await leaseCollection.insertOne({
        _id: leaseKey,
        leaseUntil: new Date(0),
        nextAllowedAt: new Date(0),
        createdAt: leaseNow,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    const lease = await leaseCollection.findOneAndUpdate(
      {
        _id: leaseKey,
        leaseUntil: { $lte: leaseNow },
        nextAllowedAt: { $lte: leaseNow },
      },
      {
        $set: {
          leaseOwner,
          leaseUntil: new Date(leaseNow.getTime() + 90 * 1000),
          updatedAt: leaseNow,
        },
      },
      { returnDocument: "after" },
    );

    if (!lease) {
      return NextResponse.json({
        success: true,
        processed: 0,
        retryAfterSeconds: 2,
        message: "This WhatsApp number is busy or in its sending cooldown. Try the worker again shortly.",
      }, { status: 202 });
    }

    // Pausing can happen after the earlier campaign check but before this
    // invocation acquires the phone-number lease. Recheck under the lease so
    // a newly paused campaign does not claim another recipient.
    const campaignAfterLease = await db.collection("campaigns").findOne({
      _id: campaign._id,
      workspaceId: campaign.workspaceId,
      status: "sending",
    });

    if (!campaignAfterLease) {
      await leaseCollection.updateOne(
        { _id: leaseKey, leaseOwner },
        {
          $set: {
            leaseUntil: new Date(0),
            nextAllowedAt: new Date(Date.now() + 2000),
            updatedAt: new Date(),
          },
          $unset: { leaseOwner: "" },
        },
      );

      return NextResponse.json({
        success: true,
        processed: 0,
        message: "Campaign was paused or changed before a recipient could be claimed.",
      });
    }

    const messageQuota = await checkWorkspacePlanLimit(db, campaign.workspaceId, "messages", 1);
    if (!messageQuota.allowed) {
      await db.collection("campaigns").updateOne(
        { _id: campaign._id, workspaceId: campaign.workspaceId, status: "sending" },
        {
          $set: { status: "paused", pauseReason: messageQuota.reason, pausedAt: new Date(), updatedAt: new Date() },
        },
      );
      await leaseCollection.updateOne(
        { _id: leaseKey, leaseOwner },
        {
          $set: { leaseUntil: new Date(0), nextAllowedAt: new Date(Date.now() + 2000), updatedAt: new Date() },
          $unset: { leaseOwner: "" },
        },
      );
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: messageQuota.reason, plan: messageQuota.plan, usage: messageQuota.usage, limits: messageQuota.limits }, { status: 429 });
    }

    // A crashed invocation must never cause an automatic duplicate send.
    // Once a processing lease is older than five minutes, mark its outcome
    // unknown and require operator review instead of returning it to pending.
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    await db.collection("campaignRecipients").updateMany(
      {
        workspaceId: campaign.workspaceId,
        campaignId: campaign._id,
        status: "processing",
        processingStartedAt: { $lte: staleBefore },
      },
      {
        $set: {
          status: "unknown",
          error: "Worker lease expired. Meta may have accepted the message; manual reconciliation is required.",
          updatedAt: new Date(),
        },
        $unset: { processingStartedAt: "" },
      },
    );

    const recipient = await db.collection("campaignRecipients").findOneAndUpdate(
      {
        workspaceId: campaign.workspaceId,
        campaignId: campaign._id,
        status: "pending",
        $or: [{ retryAt: { $exists: false } }, { retryAt: { $lte: new Date() } }],
      },
      {
        $set: { status: "processing", processingStartedAt: new Date(), updatedAt: new Date() },
        $inc: { attempts: 1 },
        $unset: { retryAt: "" },
      },
      { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" },
    );

    if (recipient) {
      // Consent may be revoked after the campaign snapshot was created.
      // Re-check the live contact record immediately before sending.
      const liveContact = recipient.contactId
        ? await db.collection("contacts").findOne({
            _id: recipient.contactId,
            workspaceId: campaign.workspaceId,
            "optIn.status": true,
          })
        : null;
      const suppression = liveContact?.phone
        ? await db.collection("contactSuppressions").findOne({
            workspaceId: campaign.workspaceId,
            phone: liveContact.phone,
            active: { $ne: false },
          }, { projection: { _id: 1 } })
        : null;

      if (!liveContact || !liveContact.phone || suppression) {
        await db.collection("campaignRecipients").updateOne(
          { _id: recipient._id, status: "processing" },
          {
            $set: {
              status: "skipped",
              error: suppression
                ? "Contact has an active opt-out suppression and cannot receive campaign messages."
                : "Contact is no longer opted in or no valid phone number is available.",
              updatedAt: new Date(),
            },
            $unset: { processingStartedAt: "" },
          },
        );
      } else {
      const token = decryptSecret(account.accessTokenEncrypted);
      const version = process.env.META_GRAPH_API_VERSION || "v22.0";
      const params = campaign.bodyParameters || [];
      const templateComponents = [];
      if (params.length) templateComponents.push({ type: "body", parameters: params.map((text) => ({ type: "text", text })) });
      const offerExpiresAt = campaign.template?.isLimitedTimeOffer
        ? new Date(Date.now() + Number(campaign.offerDurationHours) * 60 * 60 * 1000)
        : null;
      if (offerExpiresAt) {
        templateComponents.push({ type: "limited_time_offer", parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: offerExpiresAt.getTime() } }] });
      }
      if (campaign.template?.hasCopyCode) {
        templateComponents.push({
          type: "button",
          sub_type: "copy_code",
          index: Number.isInteger(campaign.template.copyCodeButtonIndex) ? campaign.template.copyCodeButtonIndex : 0,
          parameters: [{ type: "coupon_code", coupon_code: campaign.couponCode }],
        });
      }
      const payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: String(liveContact.phone).replace(/^\+/, ""),
        type: "template",
        template: {
          name: campaign.template.name,
          language: { code: campaign.template.language },
          ...(templateComponents.length ? { components: templateComponents } : {}),
        },
      };

      const reservation = await reserveWorkspaceMessageUsage(db, campaign.workspaceId, 1);
      if (!reservation.allowed) {
        await db.collection("campaignRecipients").updateOne(
          { _id: recipient._id, status: "processing" },
          {
            $set: { status: "pending", error: reservation.reason, updatedAt: new Date() },
            $unset: { processingStartedAt: "" },
          },
        );
        await db.collection("campaigns").updateOne(
          { _id: campaign._id, workspaceId: campaign.workspaceId, status: "sending" },
          {
            $set: { status: "paused", pauseReason: reservation.reason, pausedAt: new Date(), updatedAt: new Date() },
          },
        );
        await leaseCollection.updateOne(
          { _id: leaseKey, leaseOwner },
          {
            $set: { leaseUntil: new Date(0), nextAllowedAt: new Date(Date.now() + 2000), updatedAt: new Date() },
            $unset: { leaseOwner: "" },
          },
        );
        return NextResponse.json({
          success: false,
          code: "PLAN_LIMIT_REACHED",
          message: reservation.reason,
          plan: reservation.plan,
          usage: reservation.usage,
          limits: reservation.limits,
        }, { status: 429 });
      }

      let meta;
      let data;
      try {
        meta = await fetch("https://graph.facebook.com/" + version + "/" + account.phoneNumberId + "/messages", {
          method: "POST",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        data = await meta.json();
      } catch (error) {
        await db.collection("campaignRecipients").updateOne(
          { _id: recipient._id, status: "processing" },
          { $set: { status: "unknown", error: "Meta may have accepted this message. Manual review required.", errorDetail: error.message, updatedAt: new Date() }, $unset: { processingStartedAt: "" } },
        );
      }

      if (meta?.status === 429) {
        await releaseWorkspaceMessageUsage(db, campaign.workspaceId, 1);
        if (recipient.attempts >= 3) {
          await db.collection("campaignRecipients").updateOne(
            { _id: recipient._id, status: "processing" },
            { $set: { status: "failed", error: data?.error?.message || "Rate limit retry limit reached.", updatedAt: new Date() }, $unset: { processingStartedAt: "" } },
          );
        } else {
          await db.collection("campaignRecipients").updateOne(
            { _id: recipient._id, status: "processing" },
            { $set: { status: "pending", retryAt: new Date(Date.now() + 30000 * recipient.attempts), error: data?.error?.message || "Rate limited; retry scheduled.", updatedAt: new Date() }, $unset: { processingStartedAt: "" } },
          );
        }
      } else if (meta && [401, 403].includes(meta.status)) {
        await releaseWorkspaceMessageUsage(db, campaign.workspaceId, 1);
        // Authentication/permission failures are definite rejections. Keep
        // this recipient pending and pause the campaign until credentials
        // are repaired; never burn through the whole audience with a bad token.
        await db.collection("campaignRecipients").updateOne(
          { _id: recipient._id, status: "processing" },
          {
            $set: {
              status: "pending",
              error: data?.error?.message || "WhatsApp authorization failed. Reconnect the account before resuming.",
              updatedAt: new Date(),
            },
            $unset: { processingStartedAt: "", retryAt: "" },
          },
        );
        await db.collection("campaigns").updateOne(
          { _id: campaign._id, workspaceId: campaign.workspaceId, status: "sending" },
          {
            $set: {
              status: "paused",
              pauseReason: "WhatsApp authorization failed. Reconnect the account before resuming.",
              pausedAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );
      } else if (meta && !meta.ok) {
        await releaseWorkspaceMessageUsage(db, campaign.workspaceId, 1);
        await db.collection("campaignRecipients").updateOne(
          { _id: recipient._id, status: "processing" },
          { $set: { status: "failed", error: data?.error?.message || "Meta rejected the message.", metaErrorCode: data?.error?.code || null, updatedAt: new Date() }, $unset: { processingStartedAt: "" } },
        );
      } else if (meta?.ok) {
        const waMessageId = data?.messages?.[0]?.id;
        if (!waMessageId) {
          await db.collection("campaignRecipients").updateOne(
            { _id: recipient._id, status: "processing" },
            { $set: { status: "unknown", error: "Meta returned no message ID. Manual review required.", updatedAt: new Date() }, $unset: { processingStartedAt: "" } },
          );
        } else {
          const now = new Date();
          await db.collection("messages").updateOne(
            { workspaceId: campaign.workspaceId, waMessageId },
            { $setOnInsert: {
              workspaceId: campaign.workspaceId, contactId: recipient.contactId || null,
              phoneNumberId: account.phoneNumberId, waId: String(liveContact.phone).replace(/^\+/, ""),
              waMessageId, providerMessageId: waMessageId, direction: "outbound", type: "template",
              templateName: campaign.template.name, templateLanguage: campaign.template.language,
              ...(campaign.template?.hasCopyCode ? { templateCouponCode: campaign.couponCode } : {}),
              ...(offerExpiresAt ? { templateOfferExpiresAt: offerExpiresAt } : {}),
              campaignId: campaign._id, campaignRecipientId: recipient._id,
              status: "accepted", statusRank: 0, timestamp: now, createdAt: now, updatedAt: now,
            } },
            { upsert: true },
          );
          await db.collection("campaignRecipients").updateOne(
            { _id: recipient._id, status: "processing" },
            { $set: { status: "accepted", waMessageId, providerMessageId: waMessageId, acceptedAt: now, updatedAt: now }, $unset: { processingStartedAt: "" } },
          );
          await applyPendingWhatsAppStatus(db, campaign.workspaceId, waMessageId);
          const saved = await db.collection("messages").findOne({ workspaceId: campaign.workspaceId, waMessageId });
          if (saved?.status && saved.status !== "accepted") {
            await db.collection("campaignRecipients").updateOne(
              { _id: recipient._id, waMessageId },
              { $set: { status: saved.status, statusRank: saved.statusRank || 0, statusUpdatedAt: saved.statusUpdatedAt || now, updatedAt: new Date() } },
            );
          }
        }
      }
      }
    }

    const statuses = ["pending", "processing", "accepted", "sent", "delivered", "read", "failed", "unknown", "skipped"];
    const counts = {};
    for (const status of statuses) {
      counts[status] = await db.collection("campaignRecipients").countDocuments({ workspaceId: campaign.workspaceId, campaignId: campaign._id, status });
    }
    const finished = counts.pending === 0 && counts.processing === 0;
    const finalStatus = finished
      ? (counts.failed + counts.unknown + counts.skipped > 0 ? "completed_with_issues" : "completed")
      : "sending";
    await db.collection("campaigns").updateOne(
      { _id: campaign._id, status: "sending" },
      { $set: { status: finalStatus, progress: { total: campaign.recipientCount || 0, ...counts }, updatedAt: new Date(), ...(finished ? { completedAt: new Date() } : {}) } },
    );

    await leaseCollection.updateOne(
      { _id: leaseKey, leaseOwner },
      {
        $set: {
          leaseUntil: new Date(0),
          nextAllowedAt: new Date(Date.now() + 2000),
          updatedAt: new Date(),
        },
        $unset: { leaseOwner: "" },
      },
    );

    return NextResponse.json({ success: true, campaignId: campaign._id.toString(), processed: recipient ? 1 : 0, progress: counts, campaignStatus: finalStatus });
  } catch (error) {
    console.error("Campaign worker error:", error);
    if (typeof leaseCollection !== "undefined" && typeof leaseKey !== "undefined" && typeof leaseOwner !== "undefined") {
      await leaseCollection.updateOne(
        { _id: leaseKey, leaseOwner },
        { $set: { leaseUntil: new Date(0), nextAllowedAt: new Date(Date.now() + 2000), updatedAt: new Date() }, $unset: { leaseOwner: "" } },
      ).catch((releaseError) => console.error("Campaign worker lease release failed:", releaseError));
    }
    return NextResponse.json({ success: false, message: "Worker failed; any claimed recipient must be reconciled before retry." }, { status: 500 });
  }
}

// Vercel Cron invokes route handlers with GET requests.
export async function GET(request) {
  return POST(request);
}
