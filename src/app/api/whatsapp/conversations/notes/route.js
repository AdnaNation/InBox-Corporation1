import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { ensureConversationNoteIndexes } from "@/lib/conversation-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversationId");
    if (!conversationId || !ObjectId.isValid(conversationId)) {
      return NextResponse.json({ success: false, message: "Invalid conversation ID." }, { status: 400 });
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    await ensureConversationNoteIndexes(db);
    const conversation = await db.collection("conversations").findOne({
      _id: new ObjectId(conversationId),
      workspaceId,
    }, { projection: { _id: 1 } });

    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
    }

    const notes = await db.collection("conversationNotes")
      .find({ workspaceId, conversationId: conversation._id })
      .sort({ createdAt: 1, _id: 1 })
      .limit(200)
      .toArray();

    return NextResponse.json({ success: true, notes });
  } catch (error) {
    console.error("Load conversation notes error:", error);
    return NextResponse.json({ success: false, message: "Could not load internal notes." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
    const noteText = typeof body.text === "string" ? body.text.trim() : "";

    if (!ObjectId.isValid(conversationId)) {
      return NextResponse.json({ success: false, message: "Invalid conversation ID." }, { status: 400 });
    }
    if (!noteText || noteText.length > 2000) {
      return NextResponse.json({ success: false, message: "Internal note must be between 1 and 2000 characters." }, { status: 400 });
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    await ensureConversationNoteIndexes(db);
    const conversation = await db.collection("conversations").findOne({
      _id: new ObjectId(conversationId),
      workspaceId,
    }, { projection: { _id: 1 } });

    if (!conversation) {
      return NextResponse.json({ success: false, message: "Conversation not found." }, { status: 404 });
    }

    const now = new Date();
    const note = {
      workspaceId,
      conversationId: conversation._id,
      text: noteText,
      authorUserId: new ObjectId(session.user.id),
      authorName: session.user.name || session.user.email || "Workspace member",
      authorEmail: session.user.email || "",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("conversationNotes").insertOne(note);
    return NextResponse.json({
      success: true,
      note: { ...note, _id: result.insertedId },
    }, { status: 201 });
  } catch (error) {
    console.error("Create conversation note error:", error);
    return NextResponse.json({ success: false, message: "Could not save internal note." }, { status: 500 });
  }
}
