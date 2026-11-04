import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = [
  "pending",
  "processing",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "unknown",
  "skipped",
];

export async function GET(_request, { params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign ID." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const campaignId = new ObjectId(id);
    const campaign = await db.collection("campaigns").findOne(
      { _id: campaignId, workspaceId },
      { projection: { status: 1, recipientCount: 1, updatedAt: 1, completedAt: 1, pauseReason: 1 } },
    );

    if (!campaign) {
      return NextResponse.json(
        { success: false, message: "Campaign not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rows = await db.collection("campaignRecipients").aggregate([
      { $match: { workspaceId, campaignId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray();

    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const row of rows) {
      if (Object.hasOwn(counts, row._id)) counts[row._id] = row.count;
    }

    const total = STATUSES.reduce((sum, status) => sum + counts[status], 0);
    const finished = total - counts.pending - counts.processing;
    const delivered = counts.delivered + counts.read;
    const accepted = counts.accepted + counts.sent + delivered;
    const percent = (value) => total ? Math.round((value / total) * 100) : 0;

    return NextResponse.json({
      success: true,
      campaign: {
        status: campaign.status,
        total: campaign.recipientCount ?? total,
        updatedAt: campaign.updatedAt || null,
        completedAt: campaign.completedAt || null,
        pauseReason: campaign.pauseReason || null,
      },
      counts,
      summary: {
        finished,
        delivered,
        accepted,
        deliveryRate: percent(delivered),
        completionRate: percent(finished),
        readRate: delivered ? Math.round((counts.read / delivered) * 100) : 0,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Campaign progress error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load campaign progress." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
