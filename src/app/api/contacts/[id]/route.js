import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { ensureWorkspaceContactUsageCounter, releaseWorkspaceContactUsage } from "@/lib/plan-limits";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid origin." },
      { status: 403 },
    );
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid contact ID." },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();

    if (
      !Array.isArray(body.tags) ||
      body.tags.length > 10 ||
      body.tags.some(
        (tag) =>
          typeof tag !== "string" || !tag.trim() || tag.trim().length > 30,
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid tags. Maximum 10 tags allowed." },
        { status: 400 },
      );
    }

    const tags = [...new Set(body.tags.map((tag) => tag.trim().toLowerCase()))];

    const db = await getDatabase();

    const result = await db.collection("contacts").updateOne(
      {
        _id: new ObjectId(id),
        workspaceId: new ObjectId(session.workspace.id),
      },
      {
        $set: {
          tags,
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return NextResponse.json(
        { success: false, message: "Contact not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      tags,
      message: "Contact tags updated.",
    });
  } catch (error) {
    console.error("Contact tag update error:", error);

    return NextResponse.json(
      { success: false, message: "Could not update contact tags." },
      { status: 500 },
    );
  }
}

export async function DELETE(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid origin." },
      { status: 403 },
    );
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  const { id } = await params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json(
      { success: false, message: "Invalid contact ID." },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const contactId = new ObjectId(id);

  // Initialize the lifetime counter before removing a legacy contact so its
  // capacity is released even when this workspace has never created a contact
  // reservation before.
  await ensureWorkspaceContactUsageCounter(db, workspaceId);

  const result = await db.collection("contacts").deleteOne({
    _id: contactId,
    workspaceId,
  });

  if (!result.deletedCount) {
    return NextResponse.json(
      { success: false, message: "Contact not found." },
      { status: 404 },
    );
  }

  await releaseWorkspaceContactUsage(db, workspaceId, 1);
  await db.collection("groups").updateMany(
    { workspaceId },
    {
      $pull: {
        contactIds: contactId,
      },
    },
  );

  return NextResponse.json({ success: true });
}
