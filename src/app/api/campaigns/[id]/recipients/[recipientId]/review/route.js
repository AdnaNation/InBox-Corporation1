import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { id, recipientId } = await params;
    if (!ObjectId.isValid(id) || !ObjectId.isValid(recipientId)) {
      return NextResponse.json({ success: false, message: "Invalid campaign or recipient ID." }, { status: 400 });
    }

    const body = await request.json();
    const outcome = body?.outcome;
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!["delivered", "failed"].includes(outcome) || note.length < 5 || note.length > 500) {
      return NextResponse.json({ success: false, message: "Choose a valid outcome and provide a review note (5–500 characters)." }, { status: 400 });
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const campaignId = new ObjectId(id);
    const recipientObjectId = new ObjectId(recipientId);
    const now = new Date();

    const result = await db.collection("campaignRecipients").updateOne(
      { _id: recipientObjectId, campaignId, workspaceId, status: "unknown" },
      {
        $set: {
          status: outcome,
          manualReview: {
            outcome,
            note,
            reviewedBy: new ObjectId(session.user.id),
            reviewedAt: now,
          },
          updatedAt: now,
        },
      },
    );

    if (!result.modifiedCount) {
      return NextResponse.json({ success: false, message: "This recipient is no longer marked unknown. Refresh the page before reviewing it." }, { status: 409 });
    }

    const statusNames = ["pending", "processing", "accepted", "sent", "delivered", "read", "failed", "unknown", "skipped"];
    const counts = {};
    for (const status of statusNames) {
      counts[status] = await db.collection("campaignRecipients").countDocuments({ workspaceId, campaignId, status });
    }

    const unfinished = counts.pending + counts.processing;
    const issues = counts.failed + counts.unknown + counts.skipped;
    await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId },
      {
        $set: {
          progress: { total: Object.values(counts).reduce((sum, count) => sum + count, 0), ...counts },
          ...(unfinished === 0 ? { status: issues > 0 ? "completed_with_issues" : "completed", completedAt: now } : {}),
          updatedAt: now,
        },
      },
    );

    return NextResponse.json({
      success: true,
      status: outcome,
      message: outcome === "delivered"
        ? "Recipient marked as delivered after manual verification. No message was resent."
        : "Recipient marked as failed after manual verification. It will not be resent automatically.",
    });
  } catch (error) {
    console.error("Campaign recipient review error:", error);
    return NextResponse.json({ success: false, message: "Could not save the manual review." }, { status: 500 });
  }
}
