import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    const db = await getDatabase();

    // Load messages for one selected conversation.
    if (conversationId) {
      if (!ObjectId.isValid(conversationId)) {
        return NextResponse.json(
          { success: false, message: "Invalid conversation ID." },
          { status: 400 },
        );
      }

      const conversation = await db.collection("conversations").findOne({
        _id: new ObjectId(conversationId),
        workspaceId,
      });

      if (!conversation) {
        return NextResponse.json(
          { success: false, message: "Conversation not found." },
          { status: 404 },
        );
      }

      const messages = await db
        .collection("messages")
        .find({
          workspaceId,
          conversationId: conversation._id,
        })
        .sort({ timestamp: 1, _id: 1 })
        .limit(200)
        .toArray();

      // Opening a conversation clears its unread count.
      await db
        .collection("conversations")
        .updateOne(
          { _id: conversation._id, workspaceId },
          { $set: { unreadCount: 0, updatedAt: new Date() } },
        );

      return NextResponse.json({
        success: true,
        conversation: {
          ...conversation,
          unreadCount: 0,
        },
        messages,
      });
    }

    // Load conversation list.
    const conversations = await db
      .collection("conversations")
      .find({ workspaceId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Load conversations error:", error);

    return NextResponse.json(
      { success: false, message: "Could not load conversations." },
      { status: 500 },
    );
  }
}
