import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { verifyWhatsAppWebhookSignature } from "@/lib/whatsapp-webhook-security.mjs";
import { enqueueWebhookEvent } from "@/lib/public-webhooks.mjs";
import { isWhatsAppOptOutMessage } from "@/lib/whatsapp-opt-out.mjs";
import { ensureWhatsAppWebhookIndexes } from "@/lib/whatsapp-webhook-indexes.mjs";
import { extractWhatsAppMessageContent } from "@/lib/whatsapp-message-content.mjs";
import { refreshCampaignProgress } from "@/lib/campaign-progress.mjs";
import { matchesWhatsAppWebhookAccount } from "@/lib/whatsapp-webhook-routing.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// --------------------------------------------------
// META WEBHOOK VERIFICATION
// --------------------------------------------------

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return NextResponse.json({ success: false, message: "Webhook verification failed." }, { status: 403 });
  }

  try {
    const db = await getDatabase();
    const [accounts, pendingAccounts] = await Promise.all([
      db.collection("whatsappAccounts").find(
        { status: "connected", webhookVerifyTokenEncrypted: { $exists: true, $ne: "" } },
        { projection: { webhookVerifyTokenEncrypted: 1 } },
      ).toArray(),
      db.collection("whatsappPendingConnections").find(
        { status: "pending", webhookVerifyTokenEncrypted: { $exists: true, $ne: "" } },
        { projection: { webhookVerifyTokenEncrypted: 1 } },
      ).toArray(),
    ]);

    for (const account of [...accounts, ...pendingAccounts]) {
      try {
        if (decryptSecret(account.webhookVerifyTokenEncrypted) === token) {
          return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
        }
      } catch {
        // Ignore one malformed encrypted credential and continue checking
        // other connected or pending tenants.
      }
    }

    // Compatibility for legacy Wavo-owned connections. New customer-owned
    // connections always use their workspace-specific encrypted verify token.
    if (process.env.META_WEBHOOK_VERIFY_TOKEN && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  } catch (error) {
    console.error("WhatsApp webhook verification lookup failed:", error);
  }

  return NextResponse.json({ success: false, message: "Webhook verification failed." }, { status: 403 });
}

// --------------------------------------------------
// PROCESS INCOMING MESSAGE
// --------------------------------------------------

async function processIncomingMessage(db, account, value, message) {
  const workspaceId = account.workspaceId;
  const phoneNumberId = value.metadata.phone_number_id;

  const waId = message.from;

  if (!waId || !message.id) {
    return;
  }

  const timestamp = message.timestamp
    ? new Date(Number(message.timestamp) * 1000)
    : new Date();

  const profile = value.contacts?.find((contact) => contact.wa_id === waId);

  const customerName = profile?.profile?.name || waId;

  // Find or create WhatsApp contact.

  const contactResult = await db.collection("whatsappContacts").updateOne(
    { workspaceId, waId },
    {
      $set: {
        name: customerName,
        waId,
        phone: waId,
        lastMessageAt: timestamp,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        workspaceId,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  let contact;

  if (contactResult.upsertedId) {
    contact = {
      _id: contactResult.upsertedId,
    };
  } else {
    contact = await db.collection("whatsappContacts").findOne({
      workspaceId,
      waId,
    });
  }

  if (!contact) {
    throw new Error("Could not find or create WhatsApp contact.");
  }

  // Find or create conversation.

  await db.collection("conversations").updateOne(
    { workspaceId, phoneNumberId, waId },
    {
      $set: {
        workspaceId,
        contactId: contact._id,
        phoneNumberId,
        waId,
        customerName,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        status: "open",
        unreadCount: 0,
        lastMessageAt: timestamp,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  const conversation = await db.collection("conversations").findOne({
    workspaceId,
    phoneNumberId,
    waId,
  });

  if (!conversation) {
    throw new Error("Could not find or create conversation.");
  }

  // Extract message data.

  const content = extractWhatsAppMessageContent(message);

  // A clear opt-out keyword immediately revokes marketing consent.
  // Keep a durable workspace-level suppression record so deleting and
  // re-importing a contact cannot silently restore consent.
  if (isWhatsAppOptOutMessage(message)) {
    const optOutAt = timestamp;
    await db.collection("contactSuppressions").updateOne(
      { workspaceId, phone: waId },
      {
        $setOnInsert: {
          workspaceId,
          phone: waId,
          reason: "inbound_keyword",
          keyword: content.text.trim().toLowerCase(),
          optedOutAt: optOutAt,
          createdAt: new Date(),
        },
        $set: {
          active: true,
          reason: "inbound_keyword",
          keyword: content.text.trim().toLowerCase(),
          optedOutAt: optOutAt,
          lastOptOutMessageId: message.id,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    await db.collection("contacts").updateMany(
      { workspaceId, phone: waId },
      {
        $set: {
          "optIn.status": false,
          "optIn.revokedAt": optOutAt,
          "optIn.revocationSource": "whatsapp_inbound_keyword",
          "optIn.revocationMessageId": message.id,
          updatedAt: new Date(),
        },
      },
    );
  }

  // Insert message only once.
  // waMessageId is unique within a workspace.

  const messageResult = await db.collection("messages").updateOne(
    {
      workspaceId,
      waMessageId: message.id,
    },
    {
      $setOnInsert: {
        workspaceId,
        conversationId: conversation._id,
        contactId: contact._id,
        waMessageId: message.id,
        phoneNumberId,
        waId,
        direction: "inbound",
        type: content.type,
        text: content.text,
        media: content.media || null,
        location: content.location || null,
        status: "received",
        timestamp,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  // Only increment unread count for a newly inserted message.

  if (messageResult.upsertedCount > 0) {
    await db.collection("conversations").updateOne(
      { _id: conversation._id, workspaceId },
      {
        $set: {
          lastMessageAt: timestamp,
          lastMessagePreview: content.text || `[${content.type}]`,
          updatedAt: new Date(),
          status: "open",
        },
        $inc: {
          unreadCount: 1,
        },
      },
    );
  }

  // Enqueue outside the insert-only branch so Meta retries can recover a
  // queueing failure after the message itself has already been persisted.
  await enqueueWebhookEvent(db, workspaceId, "message.received", {
    messageId: message.id, from: waId, contactId: String(contact._id),
    conversationId: String(conversation._id), messageType: content.type,
    text: content.text, timestamp: timestamp.toISOString(),
  }, "whatsapp-message-" + message.id);
}

// --------------------------------------------------
// PROCESS DELIVERY / READ / FAILED STATUSES
// --------------------------------------------------

async function processStatus(db, account, status) {
  if (!status.id || !status.status) return;

  const workspaceId = account.workspaceId;

  const statusRanks = {
    sent: 1,
    failed: 2,
    delivered: 3,
    read: 4,
  };

  const incomingRank = statusRanks[status.status];

  if (!incomingRank) return;

  const statusDate = status.timestamp
    ? new Date(Number(status.timestamp) * 1000)
    : new Date();

  const statusTimestampField = {
    sent: "sentAt",
    delivered: "deliveredAt",
    read: "readAt",
    failed: "failedAt",
  }[status.status];

  const updateData = {
    workspaceId,
    waMessageId: status.id,
    status: status.status,
    statusRank: incomingRank,
    statusUpdatedAt: statusDate,
    updatedAt: new Date(),
  };

  if (status.errors?.length) {
    updateData.error = status.errors.map((error) => ({
      code: error.code,
      title: error.title,
      message: error.message,
    }));
  }

  const messages = db.collection("messages");

  // First, save the event so an early webhook isn't lost.
  await db.collection("whatsappPendingStatuses").updateOne(
    { workspaceId, waMessageId: status.id },
    [
      {
        $set: {
          workspaceId,
          waMessageId: status.id,
          status: {
            $cond: [
              {
                $gt: [incomingRank, { $ifNull: ["$statusRank", 0] }],
              },
              status.status,
              "$status",
            ],
          },
          statusRank: {
            $max: [{ $ifNull: ["$statusRank", 0] }, incomingRank],
          },
          statusUpdatedAt: {
            $cond: [
              {
                $gte: [incomingRank, { $ifNull: ["$statusRank", 0] }],
              },
              statusDate,
              "$statusUpdatedAt",
            ],
          },
          ...(statusTimestampField ? {
            [statusTimestampField]: {
              $ifNull: ["$" + statusTimestampField, statusDate],
            },
          } : {}),
          error: {
            $cond: [
              { $gt: [incomingRank, { $ifNull: ["$statusRank", 0] }] },
              updateData.error || "$$REMOVE",
              "$error",
            ],
          },
          ...(status.pricing ? { pricing: { $literal: status.pricing } } : {}),
          updatedAt: new Date(),
        },
      },
    ],
    { upsert: true },
  );

  // Then update the actual message, if it already exists.
  const result = await messages.updateOne(
    {
      workspaceId,
      waMessageId: status.id,
    },
    [
      {
        $set: {
          status: {
            $switch: {
              branches: [
                {
                  case: {
                    $gt: [incomingRank, { $ifNull: ["$statusRank", 0] }],
                  },
                  then: status.status,
                },
              ],
              default: "$status",
            },
          },
          statusRank: {
            $max: [{ $ifNull: ["$statusRank", 0] }, incomingRank],
          },
          statusUpdatedAt: {
            $cond: [
              {
                $gte: [incomingRank, { $ifNull: ["$statusRank", 0] }],
              },
              statusDate,
              "$statusUpdatedAt",
            ],
          },
          ...(statusTimestampField ? {
            [statusTimestampField]: {
              $ifNull: ["$" + statusTimestampField, statusDate],
            },
          } : {}),
          error: {
            $cond: [
              { $gt: [incomingRank, { $ifNull: ["$statusRank", 0] }] },
              updateData.error || "$REMOVE",
              "$error",
            ],
          },
          ...(status.pricing ? { pricing: { $literal: status.pricing } } : {}),
        },
      },
    ],
  );

  // Keep the pending event if the message hasn't been saved yet.
  if (result.matchedCount > 0) {
    await db.collection("whatsappPendingStatuses").deleteOne({
      workspaceId,
      waMessageId: status.id,
    });
  }

  // Keep campaign recipient and campaign-level progress in sync with Meta.
  // Campaign sending can finish before delivery callbacks arrive, so a later
  // failed callback must still move a completed campaign to completed_with_issues.
  if (result.matchedCount > 0) {
    const campaignRecipient = await db.collection("campaignRecipients").findOne(
      { workspaceId, waMessageId: status.id },
      { projection: { campaignId: 1 } },
    );

    await db.collection("campaignRecipients").updateOne(
      {
        workspaceId,
        waMessageId: status.id,
        $or: [
          { statusRank: { $exists: false } },
          { statusRank: { $lt: incomingRank } },
        ],
      },
      {
        $set: {
          status: status.status,
          statusRank: incomingRank,
          statusUpdatedAt: statusDate,
          ...(statusTimestampField ? { [statusTimestampField]: statusDate } : {}),
          updatedAt: new Date(),
          ...(updateData.error ? { error: updateData.error } : {}),
        },
        ...(status.status !== "failed" ? { $unset: { error: "", metaErrorCode: "" } } : {}),
      },
    );

    // Refresh even when this particular event did not advance the recipient
    // rank: Meta may be retrying a webhook after a previous reconciliation
    // failed between saving the recipient and updating the campaign summary.
    if (campaignRecipient?.campaignId) {
      await refreshCampaignProgress(db, workspaceId, campaignRecipient.campaignId);
    }

    await enqueueWebhookEvent(db, workspaceId, "message.status_updated", {
      messageId: status.id,
      status: status.status,
      timestamp: statusDate.toISOString(),
    }, "whatsapp-status-" + status.id + "-" + status.status + "-" + String(status.timestamp || "unknown"));
  }

  console.log(
    result.matchedCount > 0
      ? `Message status updated: ${status.status}`
      : `Message status saved for later: ${status.id}`,
  );
}

// --------------------------------------------------
// META POST WEBHOOK
// --------------------------------------------------

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload." }, { status: 400 });
    }

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ success: false, message: "Unsupported webhook object." }, { status: 404 });
    }

    const db = await getDatabase();
    await ensureWhatsAppWebhookIndexes(db);
    const routedChanges = [];

    // A Meta App signs its webhook with that app's own secret. Resolve each
    // phone/WABA pair to its tenant first, then verify against that tenant's
    // encrypted App Secret before processing any event.
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const account = await db.collection("whatsappAccounts").findOne({
          phoneNumberId: String(phoneNumberId),
          status: "connected",
        });
        if (!account || !matchesWhatsAppWebhookAccount(account, entry.id, phoneNumberId)) {
          console.warn("Ignoring WhatsApp webhook with no matching connected WABA/phone account.", {
            wabaId: entry.id,
            phoneNumberId,
          });
          continue;
        }

        let appSecret;
        try {
          appSecret = account.metaAppSecretEncrypted
            ? decryptSecret(account.metaAppSecretEncrypted)
            : process.env.META_APP_SECRET;
        } catch {
          appSecret = null;
        }

        if (!verifyWhatsAppWebhookSignature(rawBody, signature, appSecret)) {
          console.error("WhatsApp webhook signature did not match the Meta App Secret for the resolved customer account.", {
            workspaceId: String(account.workspaceId),
            phoneNumberId: String(phoneNumberId),
          });
          return NextResponse.json({ success: false, message: "Invalid webhook signature for this connected Meta App." }, { status: 401 });
        }

        routedChanges.push({ account, value });
      }
    }

    if (!routedChanges.length) {
      // Acknowledge unrelated/removed phone numbers so Meta does not retry
      // events that this Wavo installation is not responsible for.
      return NextResponse.json({ success: true, message: "No matching connected WhatsApp account; event ignored." });
    }

    for (const { account, value } of routedChanges) {
      for (const message of value.messages || []) {
        await processIncomingMessage(db, account, value, message);
      }
      for (const status of value.statuses || []) {
        await processStatus(db, account, status);
      }
    }

    return NextResponse.json({ success: true, message: "Webhook processed." });
  } catch (error) {
    console.error("WhatsApp webhook processing failed:", error);
    return NextResponse.json({ success: false, message: "Webhook processing failed." }, { status: 500 });
  }
}
