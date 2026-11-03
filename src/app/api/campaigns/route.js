import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const { audience, template } = body;

    if (
      !name ||
      name.length > 100 ||
      !audience ||
      !template ||
      !["all", "group", "tag"].includes(audience.type) ||
      typeof template.name !== "string" ||
      !/^[a-zA-Z0-9_]+$/.test(template.name) ||
      typeof template.language !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(template.language)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign details." },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);

    // Build the audience filter using server-side workspace data.
    const contactFilter = {
      workspaceId,
      "optIn.status": true,
    };

    let savedAudience = {
      type: audience.type,
    };

    if (audience.type === "group") {
      if (
        typeof audience.groupId !== "string" ||
        !ObjectId.isValid(audience.groupId)
      ) {
        return NextResponse.json(
          { success: false, message: "Select a valid group." },
          { status: 400 },
        );
      }

      const group = await db.collection("groups").findOne({
        _id: new ObjectId(audience.groupId),
        workspaceId,
      });

      if (!group) {
        return NextResponse.json(
          { success: false, message: "Group not found." },
          { status: 404 },
        );
      }

      contactFilter._id = {
        $in: group.contactIds || [],
      };

      savedAudience = {
        type: "group",
        groupId: group._id,
        groupName: group.name,
      };
    }

    if (audience.type === "tag") {
      const tag = typeof audience.tag === "string" ? audience.tag.trim() : "";

      if (!tag || tag.length > 30) {
        return NextResponse.json(
          { success: false, message: "Select a valid tag." },
          { status: 400 },
        );
      }

      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      contactFilter.tags = {
        $regex: `^${escapedTag}$`,
        $options: "i",
      };

      savedAudience = {
        type: "tag",
        tag,
      };
    }

    // Check that the audience currently has eligible contacts.
    const targetCount = await db
      .collection("contacts")
      .countDocuments(contactFilter);

    if (targetCount === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "This audience has no opted-in contacts.",
        },
        { status: 400 },
      );
    }

    // Verify the connected WhatsApp account.
    const account = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      status: "connected",
    });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "WhatsApp account is not connected." },
        { status: 400 },
      );
    }

    // Verify the template directly with Meta.
    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v22.0";

    const templateUrl = new URL(
      `https://graph.facebook.com/${version}/${account.wabaId}/message_templates`,
    );

    templateUrl.searchParams.set("fields", "id,name,status,language,category");
    templateUrl.searchParams.set("limit", "100");

    const templateResponse = await fetch(templateUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const templateData = await templateResponse.json();

    if (!templateResponse.ok) {
      console.error("Meta template verification error:", templateData);

      return NextResponse.json(
        {
          success: false,
          message: "Could not verify the WhatsApp template with Meta.",
        },
        { status: 502 },
      );
    }

    const approvedTemplate = (templateData.data || []).find(
      (item) =>
        item.name === template.name &&
        item.language === template.language &&
        item.status === "APPROVED",
    );

    if (!approvedTemplate) {
      return NextResponse.json(
        {
          success: false,
          message: "This template is not approved or does not exist.",
        },
        { status: 400 },
      );
    }

    const now = new Date();

    const campaign = {
      workspaceId,
      name,
      audience: savedAudience,
      template: {
        id: approvedTemplate.id,
        name: approvedTemplate.name,
        language: approvedTemplate.language,
        category: approvedTemplate.category,
      },
      targetCount,
      status: "draft",
      createdBy: new ObjectId(session.user.id),
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("campaigns").insertOne(campaign);

    return NextResponse.json(
      {
        success: true,
        message: "Campaign draft created successfully.",
        campaign: {
          id: result.insertedId.toString(),
          name,
          audience: {
            type: savedAudience.type,
            groupName: savedAudience.groupName || null,
            tag: savedAudience.tag || null,
          },
          template: campaign.template,
          targetCount,
          status: campaign.status,
          createdAt: now.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create campaign error:", error);

    return NextResponse.json(
      { success: false, message: "Could not create campaign draft." },
      { status: 500 },
    );
  }
}
