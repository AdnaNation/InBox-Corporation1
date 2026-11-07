import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { checkWorkspacePlanLimit, reserveWorkspaceCampaignUsage, releaseWorkspaceCampaignUsage } from "@/lib/plan-limits";
import { enqueueWebhookEvent } from "@/lib/public-webhooks.mjs";
import { getActiveSuppressedPhones } from "@/lib/contact-suppression.mjs";

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

  let campaignId = null;
  let campaignUsageReserved = false;
  let campaignUsageCommitted = false;
  let campaignUsageWorkspaceId = null;
  const db = await getDatabase();

  try {
    const body = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const audience = body.audience;
    const template = body.template;
    const bodyParameters = body.bodyParameters ?? [];
    const couponCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    const offerDurationHours = body.offerDurationHours === null || body.offerDurationHours === undefined ? null : Number(body.offerDurationHours);

    if (
      !name ||
      name.length > 100 ||
      !audience ||
      !template ||
      !["all", "group", "tag"].includes(audience.type) ||
      typeof template.name !== "string" ||
      !/^[a-zA-Z0-9_]+$/.test(template.name) ||
      typeof template.language !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(template.language) ||
      !Array.isArray(bodyParameters) ||
      bodyParameters.length > 20 ||
      !bodyParameters.every((value) => typeof value === "string" && value.length <= 1024) ||
      (couponCode && (!/^[A-Za-z0-9_-]{1,20}$/.test(couponCode))) ||
      (offerDurationHours !== null && (!Number.isInteger(offerDurationHours) || offerDurationHours < 1 || offerDurationHours > 168))
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign details." },
        { status: 400 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    campaignUsageWorkspaceId = workspaceId;

    // A connected account is required, but we do not call Meta here.
    const account = await getActiveWhatsAppAccount(db, workspaceId);

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Connect your WhatsApp account first." },
        { status: 400 },
      );
    }

    // Build a workspace-scoped, opted-in audience.
    const contactFilter = {
      workspaceId,
      "optIn.status": true,
    };

    let savedAudience = { type: audience.type };

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

      contactFilter._id = { $in: group.contactIds || [] };

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

      savedAudience = { type: "tag", tag };
    }

    const suppressedPhones = await getActiveSuppressedPhones(db, workspaceId);
    if (suppressedPhones.length) contactFilter.phone = { $nin: suppressedPhones };

    const contacts = db.collection("contacts");
    const targetCount = await contacts.countDocuments(contactFilter);

    if (!targetCount) {
      return NextResponse.json(
        {
          success: false,
          message: "This audience has no opted-in contacts.",
        },
        { status: 400 },
      );
    }

    const messageQuota = await checkWorkspacePlanLimit(db, workspaceId, "messages", targetCount);
    if (!messageQuota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: messageQuota.reason, plan: messageQuota.plan, usage: messageQuota.usage, limits: messageQuota.limits, remainingMessages: messageQuota.remaining }, { status: 429 });
    }
    const campaignQuota = await reserveWorkspaceCampaignUsage(db, workspaceId, 1);
    if (!campaignQuota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: campaignQuota.reason, plan: campaignQuota.plan, usage: campaignQuota.usage, limits: campaignQuota.limits, remainingMessages: messageQuota.remaining }, { status: 429 });
    }
    campaignUsageReserved = true;

    // Unique recipient per contact per campaign.
    await db
      .collection("campaignRecipients")
      .createIndex(
        { workspaceId: 1, campaignId: 1, contactId: 1 },
        { unique: true },
      );

    const now = new Date();

    // Create in preparing state until the recipient snapshot is complete.
    const campaign = {
      workspaceId,
      name,
      audience: savedAudience,
      template: {
        name: template.name,
        language: template.language,
        id: null,
        category: null,
      },
      bodyParameters: bodyParameters.map((value) => value.trim()),
      ...(couponCode ? { couponCode } : {}),
      ...(offerDurationHours !== null ? { offerDurationHours } : {}),
      templateVerification: "pending",
      targetCount,
      recipientCount: 0,
      status: "preparing",
      createdBy: new ObjectId(session.user.id),
      createdAt: now,
      updatedAt: now,
    };

    const created = await db.collection("campaigns").insertOne(campaign);
    campaignId = created.insertedId;

    // Freeze the eligible audience at draft creation time.
    const cursor = contacts.find(contactFilter).project({
      name: 1,
      phone: 1,
      tags: 1,
    });

    let batch = [];
    let insertedCount = 0;

    while (await cursor.hasNext()) {
      const contact = await cursor.next();

      batch.push({
        workspaceId,
        campaignId,
        contactId: contact._id,
        name: contact.name || "",
        phone: contact.phone,
        tags: contact.tags || [],
        status: "pending",
        attempts: 0,
        providerMessageId: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });

      if (batch.length >= 500) {
        await db.collection("campaignRecipients").insertMany(batch);
        insertedCount += batch.length;
        batch = [];
      }
    }

    if (batch.length) {
      await db.collection("campaignRecipients").insertMany(batch);
      insertedCount += batch.length;
    }

    const finalized = await db.collection("campaigns").updateOne(
      {
        _id: campaignId,
        workspaceId,
        status: "preparing",
      },
      {
        $set: {
          recipientCount: insertedCount,
          status: "draft",
          updatedAt: new Date(),
          recipientSnapshotAt: new Date(),
        },
      },
    );
    if (finalized.modifiedCount !== 1) throw new Error("Campaign draft snapshot could not be finalized.");
    campaignUsageCommitted = true;
    try {
      await enqueueWebhookEvent(db, workspaceId, "campaign.created", {
        campaignId: campaignId.toString(), name, status: "draft", recipientCount: insertedCount,
        template: { name: template.name, language: template.language }, createdAt: now.toISOString(),
      }, "campaign-" + campaignId.toString() + "-created");
    } catch (eventError) {
      console.error("Campaign created webhook enqueue failed:", eventError);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Campaign draft and recipient snapshot created.",
        campaign: {
          id: campaignId.toString(),
          name,
          targetCount,
          recipientCount: insertedCount,
          status: "draft",
          template: {
            name: template.name,
            language: template.language,
          },
          templateVerification: "pending",
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create campaign error:", error);

    // Do not leave an incomplete campaign behind.
    if (campaignId) {
      await Promise.all([
        db.collection("campaignRecipients").deleteMany({ campaignId }),
        db.collection("campaigns").deleteOne({ _id: campaignId }),
      ]).catch((cleanupError) => {
        console.error("Campaign cleanup error:", cleanupError);
      });
    }

    if (campaignUsageReserved && !campaignUsageCommitted) {
      await releaseWorkspaceCampaignUsage(db, campaignUsageWorkspaceId).catch((releaseError) => {
        console.error("Campaign usage reservation release failed:", releaseError);
      });
    }
    return NextResponse.json(
      { success: false, message: "Could not create campaign draft." },
      { status: 500 },
    );
  }
}
