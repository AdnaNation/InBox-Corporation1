import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";
import { applyPendingWhatsAppStatus } from "@/lib/whatsapp-status";
import { reserveWorkspaceMessageUsage, releaseWorkspaceMessageUsage } from "@/lib/plan-limits";

export const runtime = "nodejs";

export async function POST(request) {
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
    const { conversationId, text } = body;

    if (
      typeof conversationId !== "string" ||
      !ObjectId.isValid(conversationId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid conversation." },
        { status: 400 },
      );
    }

    if (typeof text !== "string" || !text.trim() || text.trim().length > 4096) {
      return NextResponse.json(
        {
          success: false,
          message: "Message must be between 1 and 4096 characters.",
        },
        { status: 400 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();

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

    const account = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      phoneNumberId: conversation.phoneNumberId,
      status: "connected",
    });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "No connected WhatsApp account found." },
        { status: 404 },
      );
    }

    // Find the customer's latest inbound message.
    const latestInbound = await db.collection("messages").findOne(
      {
        workspaceId,
        conversationId: conversation._id,
        direction: "inbound",
      },
      {
        sort: { timestamp: -1 },
        projection: { timestamp: 1 },
      },
    );

    if (!latestInbound?.timestamp) {
      return NextResponse.json(
        {
          success: false,
          code: "SERVICE_WINDOW_CLOSED",
          message:
            "There is no recent incoming message. You must use an approved WhatsApp template to start this conversation.",
        },
        { status: 403 },
      );
    }

    const lastInboundTime = new Date(latestInbound.timestamp).getTime();
    const serviceWindowMs = 24 * 60 * 60 * 1000;
    const serviceWindowOpen =
      Number.isFinite(lastInboundTime) &&
      Date.now() - lastInboundTime < serviceWindowMs;

    if (!serviceWindowOpen) {
      return NextResponse.json(
        {
          success: false,
          code: "SERVICE_WINDOW_CLOSED",
          message:
            "The 24-hour customer service window has expired. Send an approved WhatsApp template instead.",
        },
        { status: 403 },
      );
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);

    const apiVersion = process.env.META_GRAPH_API_VERSION || "v22.0";
    const url = `https://graph.facebook.com/${apiVersion}/${account.phoneNumberId}/messages`;

    const quota = await reserveWorkspaceMessageUsage(db, workspaceId, 1);
    if (!quota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: quota.reason, plan: quota.plan, usage: quota.usage, limits: quota.limits }, { status: 429 });
    }

    const metaResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: conversation.waId,
        type: "text",
        text: {
          preview_url: false,
          body: text.trim(),
        },
      }),
      cache: "no-store",
    });

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      await releaseWorkspaceMessageUsage(db, workspaceId, 1);
      console.error("Meta send message error:", metaData);

      return NextResponse.json(
        {
          success: false,
          message:
            metaData?.error?.message ||
            "Meta could not send this WhatsApp message.",
          errorCode: metaData?.error?.code || null,
        },
        { status: 502 },
      );
    }

    const waMessageId = metaData?.messages?.[0]?.id;

    if (!waMessageId) {
      console.error("Meta response did not contain a message ID:", metaData);

      return NextResponse.json(
        { success: false, message: "Meta did not return a message ID." },
        { status: 502 },
      );
    }

    const now = new Date();

    const messageDocument = {
      workspaceId,
      conversationId: conversation._id,
      contactId: conversation.contactId,
      waMessageId,
      phoneNumberId: conversation.phoneNumberId,
      waId: conversation.waId,
      direction: "outbound",
      type: "text",
      text: text.trim(),
      media: null,
      location: null,
      status: "sent",
      statusRank: 1,
      timestamp: now,
      createdAt: now,
    };

    await db
      .collection("messages")
      .updateOne(
        { workspaceId, waMessageId },
        { $setOnInsert: messageDocument },
        { upsert: true },
      );

    const savedMessage = await db.collection("messages").findOne({
      workspaceId,
      waMessageId,
    });

    await db.collection("conversations").updateOne(
      { _id: conversation._id, workspaceId },
      {
        $set: {
          lastMessageAt: now,
          lastMessagePreview: text.trim(),
          updatedAt: now,
        },
      },
    );

    return NextResponse.json({
      success: true,
      message: savedMessage || messageDocument,
    });
  } catch (error) {
    console.error("Send WhatsApp message error:", error);

    return NextResponse.json(
      { success: false, message: "Could not send WhatsApp message." },
      { status: 500 },
    );
  }
}
