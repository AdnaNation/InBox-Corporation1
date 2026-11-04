import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

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
      currentUserId: session.user.id,
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


export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid request origin." },
      { status: 403 },
    );
  }

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { conversationId } = body;

    if (typeof conversationId !== "string" || !ObjectId.isValid(conversationId)) {
      return NextResponse.json(
        { success: false, message: "Invalid conversation ID." },
        { status: 400 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    const updates = { updatedAt: new Date() };

    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      if (!["open", "closed"].includes(body.status)) {
        return NextResponse.json(
          { success: false, message: "Invalid conversation status." },
          { status: 400 },
        );
      }
      updates.status = body.status;
    }

    if (Object.prototype.hasOwnProperty.call(body, "assigneeUserId")) {
      const canManageAssignments = ["owner", "admin"].includes(session.membership?.role);
      if (!canManageAssignments) {
        if (body.assigneeUserId !== session.user.id) {
          return NextResponse.json(
            { success: false, message: "Agents can only assign unassigned conversations to themselves." },
            { status: 403 },
          );
        }
        const existingConversation = await db.collection("conversations").findOne({
          _id: new ObjectId(conversationId),
          workspaceId,
        }, { projection: { assigneeUserId: 1 } });
        if (existingConversation?.assigneeUserId && existingConversation.assigneeUserId.toString() !== session.user.id) {
          return NextResponse.json(
            { success: false, message: "This conversation is already assigned to another team member." },
            { status: 409 },
          );
        }
      }

      if (body.assigneeUserId === null || body.assigneeUserId === "") {
        updates.assigneeUserId = null;
        updates.assigneeName = null;
        updates.assigneeEmail = null;
      } else {
        if (typeof body.assigneeUserId !== "string" || !ObjectId.isValid(body.assigneeUserId)) {
          return NextResponse.json(
            { success: false, message: "Choose a valid team member." },
            { status: 400 },
          );
        }

        const membership = await db.collection("memberships").findOne({
          workspaceId,
          userId: new ObjectId(body.assigneeUserId),
          status: "active",
        });
        if (!membership) {
          return NextResponse.json(
            { success: false, message: "That user is not an active member of this workspace." },
            { status: 404 },
          );
        }

        const user = await db.collection("users").findOne({
          _id: membership.userId,
          status: "active",
        }, { projection: { name: 1, email: 1 } });
        if (!user) {
          return NextResponse.json(
            { success: false, message: "Team member is not active." },
            { status: 404 },
          );
        }
        updates.assigneeUserId = user._id;
        updates.assigneeName = user.name;
        updates.assigneeEmail = user.email;
      }
    }

    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { success: false, message: "No conversation changes supplied." },
        { status: 400 },
      );
    }

    const isAgentClaim = Object.prototype.hasOwnProperty.call(body, "assigneeUserId")
      && !["owner", "admin"].includes(session.membership?.role);
    const conversationFilter = {
      _id: new ObjectId(conversationId),
      workspaceId,
      ...(isAgentClaim
        ? {
            $or: [
              { assigneeUserId: null },
              { assigneeUserId: { $exists: false } },
              { assigneeUserId: new ObjectId(session.user.id) },
            ],
          }
        : {}),
    };

    // Claiming is atomic: only one agent can change an unassigned conversation
    // from empty to their own user ID.
    const result = await db.collection("conversations").updateOne(
      conversationFilter,
      { $set: updates },
    );

    if (!result.matchedCount) {
      return NextResponse.json(
        {
          success: false,
          message: isAgentClaim
            ? "This conversation is no longer available to claim. Refresh the inbox."
            : "Conversation not found.",
        },
        { status: isAgentClaim ? 409 : 404 },
      );
    }

    return NextResponse.json({
      success: true,
      status: updates.status,
      assigneeUserId: updates.assigneeUserId?.toString() ?? updates.assigneeUserId,
      assigneeName: updates.assigneeName,
      assigneeEmail: updates.assigneeEmail,
    });
  } catch (error) {
    console.error("Update conversation status error:", error);
    return NextResponse.json(
      { success: false, message: "Could not update conversation status." },
      { status: 500 },
    );
  }
}
