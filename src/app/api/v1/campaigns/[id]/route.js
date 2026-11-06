import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authError(auth) {
  return NextResponse.json(
    { success: false, message: auth.error },
    { status: auth.status, headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined },
  );
}

export async function GET(request, { params }) {
  const auth = await authenticateApiKey(request, "campaigns:read");
  if (auth.error) return authError(auth);

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid campaign ID." }, { status: 400 });

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const campaignId = new ObjectId(id);
  const campaign = await db.collection("campaigns").findOne(
    { _id: campaignId, workspaceId },
    { projection: {
      name: 1, audience: 1, template: 1, targetCount: 1, recipientCount: 1, status: 1,
      progress: 1, scheduledAt: 1, createdAt: 1, updatedAt: 1, queuedAt: 1,
      pausedAt: 1, resumedAt: 1, cancelledAt: 1, completedAt: 1,
      pauseReason: 1, cancelReason: 1, templateVerification: 1,
    } },
  );
  if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });

  const recipientCounts = await db.collection("campaignRecipients").aggregate([
    { $match: { workspaceId, campaignId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  const counts = Object.fromEntries(recipientCounts.map((item) => [item._id, item.count]));
  const totalRecipients = recipientCounts.reduce((sum, item) => sum + item.count, 0);

  return NextResponse.json({
    success: true,
    data: {
      id: campaign._id.toString(), name: campaign.name, audience: campaign.audience || null,
      template: campaign.template ? { name: campaign.template.name, language: campaign.template.language, status: campaign.template.status || null } : null,
      templateVerification: campaign.templateVerification || null,
      targetCount: campaign.targetCount || 0, recipientCount: campaign.recipientCount || 0,
      status: campaign.status, progress: campaign.progress || null,
      recipientCounts: counts, recipientSnapshotConsistent: totalRecipients === (campaign.recipientCount || 0),
      scheduledAt: campaign.scheduledAt || null, queuedAt: campaign.queuedAt || null,
      pausedAt: campaign.pausedAt || null, resumedAt: campaign.resumedAt || null,
      cancelledAt: campaign.cancelledAt || null, completedAt: campaign.completedAt || null,
      pauseReason: campaign.pauseReason || null, cancelReason: campaign.cancelReason || null,
      createdAt: campaign.createdAt || null, updatedAt: campaign.updatedAt || null,
    },
  });
}
