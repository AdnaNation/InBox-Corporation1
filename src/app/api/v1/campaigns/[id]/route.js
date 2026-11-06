import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authError(auth) {
  return NextResponse.json(
    { success: false, message: auth.error },
    {
      status: auth.status,
      headers: auth.retryAfterSeconds
        ? { "Retry-After": String(auth.retryAfterSeconds) }
        : undefined,
    },
  );
}

export async function GET(request, { params }) {
  const auth = await authenticateApiKey(request, "campaigns:read");
  if (auth.error) return authError(auth);

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid campaign ID." },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const campaignId = new ObjectId(id);
  const campaign = await db.collection("campaigns").findOne(
    { _id: campaignId, workspaceId },
    {
      projection: {
        name: 1, audience: 1, template: 1, targetCount: 1,
        recipientCount: 1, status: 1, progress: 1, scheduledAt: 1,
        queuedAt: 1, startedAt: 1, pausedAt: 1, resumedAt: 1,
        completedAt: 1, cancelledAt: 1, cancelReason: 1,
        pauseReason: 1, createdAt: 1, updatedAt: 1,
      },
    },
  );

  // Do not reveal whether a campaign ID exists in another workspace.
  if (!campaign) {
    return NextResponse.json(
      { success: false, message: "Campaign not found." },
      { status: 404 },
    );
  }

  const recipientStatusRows = await db.collection("campaignRecipients").aggregate([
    { $match: { workspaceId, campaignId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]).toArray();

  const recipientStatusCounts = Object.fromEntries(
    recipientStatusRows
      .filter((row) => typeof row._id === "string")
      .map((row) => [row._id, row.count]),
  );

  return NextResponse.json({
    success: true,
    data: {
      id: campaign._id.toString(),
      name: campaign.name,
      audience: campaign.audience || null,
      template: campaign.template
        ? {
            name: campaign.template.name,
            language: campaign.template.language,
            status: campaign.template.status || null,
          }
        : null,
      targetCount: campaign.targetCount || 0,
      recipientCount: campaign.recipientCount || 0,
      status: campaign.status,
      progress: campaign.progress || null,
      recipientStatusCounts,
      scheduledAt: campaign.scheduledAt || null,
      queuedAt: campaign.queuedAt || null,
      startedAt: campaign.startedAt || null,
      pausedAt: campaign.pausedAt || null,
      resumedAt: campaign.resumedAt || null,
      pauseReason: campaign.pauseReason || null,
      completedAt: campaign.completedAt || null,
      cancelledAt: campaign.cancelledAt || null,
      cancelReason: campaign.cancelReason || null,
      createdAt: campaign.createdAt || null,
      updatedAt: campaign.updatedAt || null,
    },
  });
}
