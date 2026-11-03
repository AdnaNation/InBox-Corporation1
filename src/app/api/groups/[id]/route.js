import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

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
      { success: false, message: "Invalid group ID." },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";

    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    const rawIds = body.contactIds;

    if (
      !name ||
      name.length > 60 ||
      description.length > 250 ||
      !Array.isArray(rawIds) ||
      rawIds.length > 5000 ||
      !rawIds.every(
        (contactId) =>
          typeof contactId === "string" && ObjectId.isValid(contactId),
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid group details." },
        { status: 400 },
      );
    }

    const contactIds = [
      ...new Set(rawIds.map((contactId) => contactId.toLowerCase())),
    ].map((contactId) => new ObjectId(contactId));

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const groupId = new ObjectId(id);

    const duplicate = await db.collection("groups").findOne({
      workspaceId,
      nameKey: name.toLowerCase(),
      _id: { $ne: groupId },
    });

    if (duplicate) {
      return NextResponse.json(
        { success: false, message: "A group with this name already exists." },
        { status: 409 },
      );
    }

    if (contactIds.length) {
      const validCount = await db.collection("contacts").countDocuments({
        workspaceId,
        _id: { $in: contactIds },
      });

      if (validCount !== contactIds.length) {
        return NextResponse.json(
          { success: false, message: "One or more contacts are invalid." },
          { status: 400 },
        );
      }
    }

    const result = await db.collection("groups").updateOne(
      { _id: groupId, workspaceId },
      {
        $set: {
          name,
          nameKey: name.toLowerCase(),
          description,
          contactIds,
          updatedAt: new Date(),
        },
      },
    );

    if (!result.matchedCount) {
      return NextResponse.json(
        { success: false, message: "Group not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Group updated successfully.",
      group: {
        id,
        name,
        description,
        contactIds: contactIds.map(String),
        contactCount: contactIds.length,
      },
    });
  } catch (error) {
    console.error("Update group error:", error);

    return NextResponse.json(
      { success: false, message: "Could not update group." },
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
      { success: false, message: "Invalid group ID." },
      { status: 400 },
    );
  }

  const db = await getDatabase();

  const result = await db.collection("groups").deleteOne({
    _id: new ObjectId(id),
    workspaceId: new ObjectId(session.workspace.id),
  });

  if (!result.deletedCount) {
    return NextResponse.json(
      { success: false, message: "Group not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Group deleted.",
  });
}
