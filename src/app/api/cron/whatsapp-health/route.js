import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { sendWhatsAppHealthAlert } from "@/lib/whatsapp-health-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classify(response, result) {
  if (response.ok) return { status: "healthy", tokenStatus: "valid", message: "Meta accepted the saved token and returned the connected phone number." };
  const code = result?.error?.code;
  if (code === 190 || response.status === 401) return { status: "attention", tokenStatus: "invalid", message: "Meta rejected the WhatsApp access token. Update the token before sending campaigns." };
  if (response.status === 403) return { status: "attention", tokenStatus: "permission", message: "Meta denied access. Check WhatsApp permissions and business asset access." };
  return { status: "unavailable", tokenStatus: "unknown", message: "Meta could not complete the health check. Retry the check; this may be temporary." };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const db = await getDatabase();
    const accounts = await db.collection("whatsappAccounts").find(
      { status: "connected", accessTokenEncrypted: { $exists: true, $ne: "" }, phoneNumberId: { $exists: true, $ne: "" } },
      { projection: { workspaceId: 1, phoneNumberId: 1, accessTokenEncrypted: 1, lastHealthStatus: 1 } },
    ).toArray();

    const checkedAt = new Date();
    let healthy = 0;
    let attention = 0;
    let unavailable = 0;
    const failures = [];
    let alertsSent = 0;
    let alertsPending = 0;
    let alertsFailed = 0;

    for (const account of accounts) {
      let outcome;
      let metaDetails = {};
      try {
        const token = decryptSecret(account.accessTokenEncrypted);
        const version = process.env.META_GRAPH_API_VERSION || "v26.0";
        const url = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(account.phoneNumberId));
        url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating,code_verification_status");
        const response = await fetch(url, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const result = await response.json();
        outcome = classify(response, result);
        if (response.ok && result.id === account.phoneNumberId) {
          metaDetails = {
            healthVerifiedName: result.verified_name || "",
            healthQualityRating: result.quality_rating || "UNKNOWN",
            healthCodeVerificationStatus: result.code_verification_status || "UNKNOWN",
            healthDisplayPhoneNumber: result.display_phone_number || "",
          };
        } else if (response.ok) {
          outcome = { status: "attention", tokenStatus: "mismatch", message: "Meta returned a different phone number ID. Verify the connected WhatsApp account." };
        }
      } catch (error) {
        outcome = { status: "unavailable", tokenStatus: "unknown", message: "Health check could not reach Meta: " + (error?.name === "TimeoutError" ? "request timed out." : "temporary check failure.") };
      }

      const previousStatus = account.lastHealthStatus || "unknown";
      await db.collection("whatsappAccounts").updateOne(
        { _id: account._id, status: "connected" },
        { $set: {
          lastHealthStatus: outcome.status,
          lastHealthTokenStatus: outcome.tokenStatus,
          lastHealthMessage: outcome.message,
          lastHealthCheckAt: checkedAt,
          ...metaDetails,
        } },
      );

      if (previousStatus !== outcome.status) {
        const shouldNotify = outcome.status !== "healthy"
          || (previousStatus !== "unknown" && previousStatus !== "healthy");
        await db.collection("whatsappHealthEvents").insertOne({
          workspaceId: account.workspaceId,
          accountId: account._id,
          phoneNumberId: account.phoneNumberId,
          businessName: account.businessName || "",
          displayPhoneNumber: account.displayPhoneNumber || "",
          previousStatus,
          status: outcome.status,
          tokenStatus: outcome.tokenStatus,
          message: outcome.message,
          emailStatus: shouldNotify ? "pending" : "not_required",
          emailAttempts: 0,
          checkedAt,
          createdAt: checkedAt,
        });
      }

      if (outcome.status === "healthy") healthy++;
      else if (outcome.status === "attention") attention++;
      else unavailable++;
      if (outcome.status !== "healthy") failures.push({ phoneNumberId: account.phoneNumberId, status: outcome.status, message: outcome.message });
    }

    const pendingEvents = await db.collection("whatsappHealthEvents").find({
      $or: [
        { emailStatus: "pending" },
        { emailStatus: "failed", emailRetryAt: { $lte: checkedAt } },
      ],
    }).sort({ createdAt: 1 }).limit(25).toArray();

    for (const event of pendingEvents) {
      const workspace = await db.collection("workspaces").findOne(
        { _id: event.workspaceId },
        { projection: { name: 1, ownerId: 1 } },
      );
      const owner = workspace?.ownerId
        ? await db.collection("users").findOne(
            { _id: workspace.ownerId, status: "active" },
            { projection: { email: 1 } },
          )
        : null;

      if (!owner?.email) {
        await db.collection("whatsappHealthEvents").updateOne(
          { _id: event._id, emailStatus: { $in: ["pending", "failed"] } },
          { $set: { emailStatus: "skipped", emailLastError: "Workspace owner email is unavailable.", emailUpdatedAt: checkedAt } },
        );
        continue;
      }

      try {
        const delivery = await sendWhatsAppHealthAlert({
          to: owner.email,
          eventId: event._id.toString(),
          workspaceName: workspace.name || "Your workspace",
          businessName: event.businessName,
          phoneNumber: event.displayPhoneNumber,
          previousStatus: event.previousStatus,
          status: event.status,
          message: event.message,
          checkedAt: event.checkedAt || event.createdAt,
        });
        if (!delivery.configured) {
          alertsPending++;
          continue;
        }
        await db.collection("whatsappHealthEvents").updateOne(
          { _id: event._id, emailStatus: { $in: ["pending", "failed"] } },
          { $set: { emailStatus: "sent", emailSentAt: new Date(), emailProviderId: delivery.providerId, emailUpdatedAt: new Date() }, $inc: { emailAttempts: 1 } },
        );
        alertsSent++;
      } catch (error) {
        await db.collection("whatsappHealthEvents").updateOne(
          { _id: event._id, emailStatus: { $in: ["pending", "failed"] } },
          { $set: { emailStatus: "failed", emailLastError: String(error?.message || "Email delivery failed.").slice(0, 300), emailRetryAt: new Date(Date.now() + 10 * 60 * 1000), emailUpdatedAt: new Date() }, $inc: { emailAttempts: 1 } },
        );
        alertsFailed++;
      }
    }

    return NextResponse.json({
      success: true,
      checkedAt: checkedAt.toISOString(),
      checked: accounts.length,
      healthy,
      attention,
      unavailable,
      alertsSent,
      alertsPending,
      alertsFailed,
      emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      failures,
    });
  } catch (error) {
    console.error("WhatsApp health monitor error:", error);
    return NextResponse.json({ success: false, message: "WhatsApp health monitoring failed." }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
