import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(message, status, extra = {}, headers) {
  return NextResponse.json({ success: false, message, ...extra }, { status, headers });
}

function authError(auth) {
  return respond(
    auth.error,
    auth.status,
    {},
    auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  );
}

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "campaigns:write");
  if (auth.error) return authError(auth);

  const { id } = await params;
  if (!ObjectId.isValid(id)) return respond("Invalid campaign ID.", 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return respond("Invalid JSON request body.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !["pause", "resume", "cancel"].includes(body.action)) {
    return respond('Provide exactly one supported action: "pause", "resume", or "cancel".', 400);
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const campaignId = new ObjectId(id);
  const campaign = await db.collection("campaigns").findOne(
    { _id: campaignId, workspaceId },
    { projection: { status: 1, phoneNumberId: 1 } },
  );
  if (!campaign) return respond("Campaign not found.", 404);

  if (body.action === "cancel") {
    if (campaign.status === "cancelled") {
      return NextResponse.json({ success: true, data: { campaignId: id, status: "cancelled", changed: false } });
    }
    const cancellableStatuses = ["draft", "queued", "scheduled", "sending", "paused"];
    if (!cancellableStatuses.includes(campaign.status)) {
      return respond("Only draft, queued, scheduled, sending, or paused campaigns can be cancelled.", 409, { code: "CAMPAIGN_STATE_CONFLICT", status: campaign.status });
    }

    const now = new Date();
    const result = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: { $in: cancellableStatuses } },
      {
        $set: {
          status: "cancelled",
          cancelledAt: now,
          cancelledByApiKeyId: auth.apiKey._id,
          cancelReason: "Cancelled through the public API.",
          updatedAt: now,
        },
      },
    );
    if (!result.modifiedCount) return respond("Campaign state changed. Fetch it again before retrying.", 409, { code: "CAMPAIGN_STATE_CONFLICT" });

    return NextResponse.json({
      success: true,
      message: "Campaign cancelled. A message already in flight may finish, but no further recipients will be claimed. Recipient outcomes are preserved.",
      data: { campaignId: id, status: "cancelled", changed: true },
    });
  }

  if (body.action === "pause") {
    if (campaign.status === "paused") {
      return NextResponse.json({ success: true, data: { campaignId: id, status: "paused", changed: false } });
    }
    if (!["queued", "sending"].includes(campaign.status)) {
      return respond("Only queued or sending campaigns can be paused.", 409, { code: "CAMPAIGN_STATE_CONFLICT", status: campaign.status });
    }

    const now = new Date();
    const result = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: { $in: ["queued", "sending"] } },
      {
        $set: {
          status: "paused",
          pausedAt: now,
          pausedByApiKeyId: auth.apiKey._id,
          pauseReason: "Paused through the public API.",
          updatedAt: now,
        },
      },
    );
    if (!result.modifiedCount) return respond("Campaign state changed. Fetch it again before retrying.", 409, { code: "CAMPAIGN_STATE_CONFLICT" });

    return NextResponse.json({
      success: true,
      message: "Campaign paused. A message already in flight may finish, but the worker will not claim another recipient.",
      data: { campaignId: id, status: "paused", changed: true },
    });
  }

  if (campaign.status !== "paused") {
    return respond("Only paused campaigns can be resumed.", 409, { code: "CAMPAIGN_STATE_CONFLICT", status: campaign.status });
  }

  const account = await getActiveWhatsAppAccount(db, workspaceId, campaign.phoneNumberId || null);
  if (!account?.phoneNumberId || !account?.accessTokenEncrypted) {
    return respond("Reconnect the campaign's WhatsApp account before resuming.", 409, { code: "WHATSAPP_ACCOUNT_UNAVAILABLE" });
  }

  const now = new Date();
  const result = await db.collection("campaigns").updateOne(
    { _id: campaignId, workspaceId, status: "paused" },
    {
      $set: {
        status: "queued",
        resumedAt: now,
        resumedByApiKeyId: auth.apiKey._id,
        queuedAt: now,
        updatedAt: now,
      },
      $unset: { pauseReason: "" },
    },
  );
  if (!result.modifiedCount) return respond("Campaign state changed. Fetch it again before retrying.", 409, { code: "CAMPAIGN_STATE_CONFLICT" });

  return NextResponse.json({
    success: true,
    message: "Campaign resumed and returned to the delivery queue. Previously accepted, failed, skipped, and unknown recipients are not automatically resent.",
    data: { campaignId: id, status: "queued", changed: true },
  });
}
