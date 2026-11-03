import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

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
    const { type, groupId, tag } = body;

    if (!["all", "group", "tag"].includes(type)) {
      return NextResponse.json(
        { success: false, message: "Invalid audience type." },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);

    // Every audience must contain opted-in contacts only.
    const filter = {
      workspaceId,
      "optIn.status": true,
    };

    if (type === "group") {
      if (typeof groupId !== "string" || !ObjectId.isValid(groupId)) {
        return NextResponse.json(
          { success: false, message: "Select a valid group." },
          { status: 400 },
        );
      }

      const group = await db.collection("groups").findOne({
        _id: new ObjectId(groupId),
        workspaceId,
      });

      if (!group) {
        return NextResponse.json(
          { success: false, message: "Group not found." },
          { status: 404 },
        );
      }

      filter._id = { $in: group.contactIds || [] };
    }

    if (type === "tag") {
      if (typeof tag !== "string" || !tag.trim() || tag.trim().length > 30) {
        return NextResponse.json(
          { success: false, message: "Enter a valid tag." },
          { status: 400 },
        );
      }

      // Exact tag match, ignoring letter case.
      const escapedTag = tag.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.tags = {
        $regex: `^${escapedTag}$`,
        $options: "i",
      };
    }

    const contactsCollection = db.collection("contacts");

    const [total, contacts] = await Promise.all([
      contactsCollection.countDocuments(filter),
      contactsCollection
        .find(filter)
        .project({ name: 1, phone: 1, tags: 1 })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    return NextResponse.json({
      success: true,
      total,
      preview: contacts.map((contact) => ({
        id: contact._id.toString(),
        name: contact.name,
        phone: contact.phone,
        tags: contact.tags || [],
      })),
    });
  } catch (error) {
    console.error("Audience preview error:", error);

    return NextResponse.json(
      { success: false, message: "Could not load audience preview." },
      { status: 500 },
    );
  }
}
