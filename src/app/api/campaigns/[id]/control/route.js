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
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid campaign ID." }, { status: 400 });

    const body = await request.json();
    const action = body?.action;
    if (!["pause", "resume"].includes(action)) {
      return NextResponse.json({ success: false, message: "Choose pause or resume." }, { status: 400 });
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const campaignId = new ObjectId(id);
    const campaign = await db.collection("campaigns").findOne({ _id: campaignId, workspaceId });
    if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found." }, { status: 404 });

    if (action === "pause") {
      if (!["queued", "sending"].includes(campaign.status)) {
        return NextResponse.json({ success: false, message: "Only queued or sending campaigns can be paused." }, { status: 409 });
      }

      const result = await db.collection("campaigns").updateOne(
        { _id: campaignId, workspaceId, status: { $in: ["queued", "sending"] } },
        { $set: { status: "paused", pausedAt: new Date(), pausedBy: new ObjectId(session.user.id), pauseReason: "Paused by workspace user.", updatedAt: new Date() } },
      );
      if (!result.modifiedCount) return NextResponse.json({ success: false, message: "Campaign state changed. Refresh and try again." }, { status: 409 });

      return NextResponse.json({
        success: true,
        status: "paused",
        message: "Campaign paused. A message already in flight may still finish; no new recipients will be claimed.",
      });
    }

    if (campaign.status !== "paused") {
      return NextResponse.json({ success: false, message: "Only paused campaigns can be resumed." }, { status: 409 });
    }

    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account?.phoneNumberId || !account?.accessTokenEncrypted) {
      return NextResponse.json({ success: false, message: "Reconnect your WhatsApp account before resuming." }, { status: 409 });
    }

    const result = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: "paused" },
      { $set: { status: "queued", resumedAt: new Date(), resumedBy: new ObjectId(session.user.id), updatedAt: new Date() }, $unset: { pauseReason: "" } },
    );
    if (!result.modifiedCount) return NextResponse.json({ success: false, message: "Campaign state changed. Refresh and try again." }, { status: 409 });

    return NextResponse.json({
      success: true,
      status: "queued",
      message: "Campaign resumed and returned to the delivery queue. Existing accepted, failed, skipped and unknown recipients will not be resent.",
    });
  } catch (error) {
    console.error("Campaign control error:", error);
    return NextResponse.json({ success: false, message: "Could not update campaign state." }, { status: 500 });
  }
}
