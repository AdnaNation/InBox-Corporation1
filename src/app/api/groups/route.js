import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);

  const groups = await db
    .collection("groups")
    .find({ workspaceId })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    success: true,
    groups: groups.map((group) => ({
      id: group._id.toString(),
      name: group.name,
      description: group.description || "",
      contactIds: (group.contactIds || []).map(String),
      contactCount: (group.contactIds || []).length,
      createdAt: group.createdAt?.toISOString(),
    })),
  });
}

export async function POST(request) {
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
      !rawIds.every((id) => typeof id === "string" && ObjectId.isValid(id))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid group details." },
        { status: 400 },
      );
    }

    const contactIds = [...new Set(rawIds.map((id) => id.toLowerCase()))].map(
      (id) => new ObjectId(id),
    );

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);

    const existing = await db.collection("groups").findOne({
      workspaceId,
      nameKey: name.toLowerCase(),
    });

    if (existing) {
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

    const now = new Date();

    const group = {
      workspaceId,
      name,
      nameKey: name.toLowerCase(),
      description,
      contactIds,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("groups").insertOne(group);

    return NextResponse.json(
      {
        success: true,
        message: "Group created successfully.",
        group: {
          id: result.insertedId.toString(),
          name,
          description,
          contactIds: contactIds.map(String),
          contactCount: contactIds.length,
          createdAt: now.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create group error:", error);

    return NextResponse.json(
      { success: false, message: "Could not create group." },
      { status: 500 },
    );
  }
}
