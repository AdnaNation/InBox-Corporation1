import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { checkWorkspacePlanLimit, reserveWorkspaceCampaignUsage, releaseWorkspaceCampaignUsage } from "@/lib/plan-limits";
import { enqueueWebhookEvent } from "@/lib/public-webhooks.mjs";
import { buildCampaignHistoryFilter, decodeCampaignCursor, encodeCampaignCursor } from "@/lib/campaign-pagination.mjs";
import { getActiveSuppressedPhones } from "@/lib/contact-suppression.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN_STATUSES = new Set(["draft", "queued", "scheduled", "sending", "paused", "cancelled", "completed", "completed_with_issues"]);
const campaignHistoryIndexByDb = new WeakMap();

async function ensureCampaignHistoryIndex(db) {
  let indexPromise = campaignHistoryIndexByDb.get(db);
  if (!indexPromise) {
    indexPromise = db.collection("campaigns")
      .createIndex({ workspaceId: 1, createdAt: -1, _id: -1 }, { name: "public_api_campaign_history" })
      .catch((error) => {
        campaignHistoryIndexByDb.delete(db);
        throw error;
      });
    campaignHistoryIndexByDb.set(db, indexPromise);
  }
  await indexPromise;
}

function authError(auth) {
  return NextResponse.json(
    { success: false, message: auth.error },
    { status: auth.status, headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined },
  );
}

export async function GET(request) {
  const auth = await authenticateApiKey(request, "campaigns:read");
  if (auth.error) return authError(auth);

  const { searchParams } = new URL(request.url);
  const limitValue = Number(searchParams.get("limit") || 50);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
    return NextResponse.json({ success: false, message: "The limit must be an integer between 1 and 100." }, { status: 400 });
  }
  const status = searchParams.get("status");
  if (status && !CAMPAIGN_STATUSES.has(status)) {
    return NextResponse.json({ success: false, message: "Unsupported campaign status." }, { status: 400 });
  }
  const cursorValue = searchParams.get("before");
  const cursor = cursorValue ? decodeCampaignCursor(cursorValue) : null;
  if (cursorValue && !cursor) {
    return NextResponse.json({ success: false, message: "The before cursor is invalid." }, { status: 400 });
  }

  const db = await getDatabase();
  try {
    await ensureCampaignHistoryIndex(db);
  } catch (error) {
    console.error("Public API campaign history index unavailable:", error);
    return NextResponse.json({ success: false, message: "Campaign history is temporarily unavailable." }, { status: 503 });
  }
  const filter = buildCampaignHistoryFilter(new ObjectId(auth.apiKey.workspaceId), cursor, status);
  const records = await db.collection("campaigns").find(filter)
    .sort({ createdAt: -1, _id: -1 }).limit(limitValue + 1)
    .project({ name: 1, audience: 1, template: 1, targetCount: 1, recipientCount: 1, status: 1, progress: 1, scheduledAt: 1, createdAt: 1, updatedAt: 1, completedAt: 1, cancelledAt: 1, cancelReason: 1, pauseReason: 1 })
    .toArray();
  const hasMore = records.length > limitValue;
  const campaigns = records.slice(0, limitValue);
  const last = campaigns[campaigns.length - 1];

  return NextResponse.json({
    success: true,
    data: campaigns.map((campaign) => ({
      id: campaign._id.toString(),
      name: campaign.name,
      audience: campaign.audience || null,
      template: campaign.template ? { name: campaign.template.name, language: campaign.template.language, status: campaign.template.status || null } : null,
      targetCount: campaign.targetCount || 0,
      recipientCount: campaign.recipientCount || 0,
      status: campaign.status,
      progress: campaign.progress || null,
      scheduledAt: campaign.scheduledAt || null,
      pauseReason: campaign.pauseReason || null,
      createdAt: campaign.createdAt || null,
      updatedAt: campaign.updatedAt || null,
      completedAt: campaign.completedAt || null,
      cancelledAt: campaign.cancelledAt || null,
      cancelReason: campaign.cancelReason || null,
    })),
    pagination: { limit: limitValue, returned: campaigns.length, hasMore, nextCursor: hasMore && last?.createdAt ? encodeCampaignCursor(last) : null },
  });
}

export async function POST(request) {
  const auth = await authenticateApiKey(request, "campaigns:write");
  if (auth.error) return authError(auth);

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Request body must be a JSON object." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const audience = body.audience;
  const template = body.template;
  const bodyParameters = body.bodyParameters === undefined ? [] : body.bodyParameters;
  const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
  const offerDurationHours = body.offerDurationHours === undefined || body.offerDurationHours === null ? null : Number(body.offerDurationHours);

  if (
    !name || name.length > 100 ||
    !audience || !["all", "group", "tag"].includes(audience.type) ||
    !template || typeof template.name !== "string" || !/^[a-zA-Z0-9_]+$/.test(template.name) ||
    typeof template.language !== "string" || !/^[a-zA-Z0-9_-]+$/.test(template.language) ||
    !Array.isArray(bodyParameters) || bodyParameters.length > 20 ||
    !bodyParameters.every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 1024) ||
    (couponCode && !/^[A-Za-z0-9_-]{1,20}$/.test(couponCode)) ||
    (offerDurationHours !== null && (!Number.isInteger(offerDurationHours) || offerDurationHours < 1 || offerDurationHours > 168))
  ) {
    return NextResponse.json({ success: false, message: "Invalid campaign details. Provide a name, supported audience, template name/language, and valid parameters." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  let campaignId = null;
  let campaignUsageReserved = false;
  let campaignUsageCommitted = false;

  try {
    const account = await getActiveWhatsAppAccount(db, workspaceId);
    if (!account) return NextResponse.json({ success: false, message: "Connect a WhatsApp account before creating campaigns." }, { status: 409 });

    const contactFilter = { workspaceId, "optIn.status": true };
    let savedAudience = { type: audience.type };

    if (audience.type === "group") {
      if (typeof audience.groupId !== "string" || !ObjectId.isValid(audience.groupId)) {
        return NextResponse.json({ success: false, message: "A valid groupId is required for a group audience." }, { status: 400 });
      }
      const group = await db.collection("groups").findOne({ _id: new ObjectId(audience.groupId), workspaceId });
      if (!group) return NextResponse.json({ success: false, message: "Group not found in this workspace." }, { status: 404 });
      contactFilter._id = { $in: group.contactIds || [] };
      savedAudience = { type: "group", groupId: group._id, groupName: group.name };
    } else if (audience.type === "tag") {
      const tag = typeof audience.tag === "string" ? audience.tag.trim() : "";
      if (!tag || tag.length > 30) return NextResponse.json({ success: false, message: "A valid tag is required for a tag audience." }, { status: 400 });
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      contactFilter.tags = { $regex: `^${escapedTag}$`, $options: "i" };
      savedAudience = { type: "tag", tag };
    }

    const suppressedPhones = await getActiveSuppressedPhones(db, workspaceId);
    if (suppressedPhones.length) contactFilter.phone = { $nin: suppressedPhones };

    const contacts = db.collection("contacts");
    const targetCount = await contacts.countDocuments(contactFilter);
    if (!targetCount) {
      return NextResponse.json({ success: false, message: "This audience has no eligible opted-in contacts." }, { status: 400 });
    }

    const messageQuota = await checkWorkspacePlanLimit(db, workspaceId, "messages", targetCount);
    if (!messageQuota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: messageQuota.reason, plan: messageQuota.plan, usage: messageQuota.usage, limits: messageQuota.limits, remainingMessages: messageQuota.remaining }, { status: 429 });
    }
    const campaignQuota = await reserveWorkspaceCampaignUsage(db, workspaceId, 1);
    if (!campaignQuota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: campaignQuota.reason, plan: campaignQuota.plan, usage: campaignQuota.usage, limits: campaignQuota.limits, remainingMessages: messageQuota.remaining }, { status: 429 });
    }
    campaignUsageReserved = true;

    await db.collection("campaignRecipients").createIndex(
      { workspaceId: 1, campaignId: 1, contactId: 1 },
      { unique: true },
    );

    const now = new Date();
    const campaign = {
      workspaceId,
      name,
      audience: savedAudience,
      template: { name: template.name, language: template.language, id: null, category: null },
      bodyParameters: bodyParameters.map((value) => value.trim()),
      ...(couponCode ? { couponCode } : {}),
      ...(offerDurationHours !== null ? { offerDurationHours } : {}),
      templateVerification: "pending",
      targetCount,
      recipientCount: 0,
      status: "preparing",
      createdByApiKeyId: auth.apiKey._id,
      createdAt: now,
      updatedAt: now,
    };

    const created = await db.collection("campaigns").insertOne(campaign);
    campaignId = created.insertedId;
    const cursor = contacts.find(contactFilter).project({ name: 1, phone: 1, tags: 1 });
    let batch = [];
    let insertedCount = 0;
    try {
      while (await cursor.hasNext()) {
        const contact = await cursor.next();
        batch.push({
          workspaceId, campaignId, contactId: contact._id,
          name: contact.name || "", phone: contact.phone, tags: contact.tags || [],
          status: "pending", attempts: 0, providerMessageId: null, error: null,
          createdAt: now, updatedAt: now,
        });
        if (batch.length >= 500) {
          await db.collection("campaignRecipients").insertMany(batch);
          insertedCount += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await db.collection("campaignRecipients").insertMany(batch);
        insertedCount += batch.length;
      }
    } finally {
      await cursor.close();
    }

    if (insertedCount !== targetCount) throw new Error("Campaign recipient snapshot count changed during creation.");
    const finalized = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: "preparing" },
      { $set: { recipientCount: insertedCount, status: "draft", updatedAt: new Date(), recipientSnapshotAt: new Date() } },
    );
    if (finalized.modifiedCount !== 1) throw new Error("Campaign draft snapshot could not be finalized.");
    campaignUsageCommitted = true;
    try {
      await enqueueWebhookEvent(db, workspaceId, "campaign.created", {
        campaignId: campaignId.toString(), name, status: "draft", recipientCount: insertedCount,
        template: { name: template.name, language: template.language }, createdAt: now.toISOString(),
      }, "campaign-" + campaignId.toString() + "-created");
    } catch (eventError) {
      console.error("Campaign created webhook enqueue failed:", eventError);
    }

    return NextResponse.json({
      success: true,
      message: "Campaign draft created. It has not been queued and no WhatsApp messages have been sent.",
      data: {
        id: campaignId.toString(), name, targetCount, recipientCount: insertedCount,
        status: "draft", template: { name: template.name, language: template.language },
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Public API campaign draft creation error:", error);
    if (campaignId) {
      await Promise.all([
        db.collection("campaignRecipients").deleteMany({ workspaceId, campaignId }),
        db.collection("campaigns").deleteOne({ _id: campaignId, workspaceId }),
      ]).catch((cleanupError) => console.error("Public API campaign cleanup error:", cleanupError));
    }
    if (campaignUsageReserved && !campaignUsageCommitted) {
      await releaseWorkspaceCampaignUsage(db, workspaceId).catch((releaseError) => {
        console.error("Campaign usage reservation release failed:", releaseError);
      });
    }
    return NextResponse.json({ success: false, message: "Could not create campaign draft." }, { status: 500 });
  }
}
