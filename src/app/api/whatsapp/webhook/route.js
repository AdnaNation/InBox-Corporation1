import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";

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

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json(
    { success: false, message: "Webhook verification failed." },
    { status: 403 },
  );
}

// --------------------------------------------------
// VERIFY META SIGNATURE
// --------------------------------------------------

function verifySignature(rawBody, signature) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret || !signature) {
    return false;
  }

  const expected = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const received = signature.replace(/^sha256=/, "");

  if (!/^[a-f0-9]{64}$/i.test(received) || !/^[a-f0-9]{64}$/i.test(expected)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
}

// --------------------------------------------------
// CREATE COLLECTION INDEXES
// --------------------------------------------------

let indexesPromise;

async function ensureIndexes(db) {
  if (!indexesPromise) {
    indexesPromise = Promise.all([
      db
        .collection("whatsappContacts")
        .createIndex({ workspaceId: 1, waId: 1 }, { unique: true }),

      db
        .collection("conversations")
        .createIndex(
          { workspaceId: 1, phoneNumberId: 1, waId: 1 },
          { unique: true },
        ),

      db
        .collection("messages")
        .createIndex({ workspaceId: 1, waMessageId: 1 }, { unique: true }),

      db
        .collection("messages")
        .createIndex({ workspaceId: 1, conversationId: 1, timestamp: -1 }),
    ]).catch((error) => {
      indexesPromise = null;
      throw error;
    });
  }

  return indexesPromise;
}

// --------------------------------------------------
// EXTRACT MESSAGE CONTENT
// --------------------------------------------------

function extractMessageContent(message) {
  const type = message.type || "unknown";
  const item = message[type];

  if (!item) {
    return {
      type,
      text: "",
      media: null,
    };
  }

  if (type === "text") {
    return {
      type,
      text: item.body || "",
      media: null,
    };
  }

  if (
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "document" ||
    type === "sticker"
  ) {
    return {
      type,
      text: item.caption || "",
      media: {
        id: item.id || null,
        mimeType: item.mime_type || null,
        filename: item.filename || null,
      },
    };
  }

  if (type === "location") {
    return {
      type,
      text: item.name || item.address || "Shared location",
      location: {
        latitude: item.latitude,
        longitude: item.longitude,
        name: item.name || null,
        address: item.address || null,
      },
      media: null,
    };
  }

  return {
    type,
    text: "",
    media: null,
  };
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

  const content = extractMessageContent(message);

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
          error: {
            $cond: [
              { $gt: [incomingRank, { $ifNull: ["$statusRank", 0] }] },
              updateData.error || "$$REMOVE",
              "$error",
            ],
          },
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
          ...(updateData.error ? { error: updateData.error } : {}),
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
  console.log("\n========== WHATSAPP WEBHOOK RECEIVED ==========");

  try {
    console.log("1. Request received from Meta");

    const rawBody = await request.text();

    console.log("2. Request body received:", rawBody.length, "characters");

    const signature = request.headers.get("x-hub-signature-256");

    console.log("3. Signature header exists:", Boolean(signature));
    console.log(
      "4. META_APP_SECRET configured:",
      Boolean(process.env.META_APP_SECRET),
    );

    if (!verifySignature(rawBody, signature)) {
      console.error("WEBHOOK ERROR: Invalid signature. Check META_APP_SECRET.");

      return NextResponse.json(
        { success: false, message: "Invalid webhook signature." },
        { status: 401 },
      );
    }

    console.log("5. Meta signature verified");

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch {
      console.error("WEBHOOK ERROR: Invalid JSON");

      return NextResponse.json(
        { success: false, message: "Invalid JSON payload." },
        { status: 400 },
      );
    }

    if (body.object !== "whatsapp_business_account") {
      console.error("WEBHOOK ERROR: Unsupported object:", body.object);

      return NextResponse.json(
        { success: false, message: "Unsupported webhook object." },
        { status: 404 },
      );
    }

    console.log("6. WhatsApp payload recognized");

    const db = await getDatabase();

    await ensureIndexes(db);

    for (const entry of body.entry || []) {
      console.log("Business Account ID:", entry.id);

      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;

        console.log("7. Webhook field:", change.field);
        console.log("Phone Number ID:", phoneNumberId);

        if (!phoneNumberId) {
          console.warn("Missing phone_number_id");
          continue;
        }

        const account = await db.collection("whatsappAccounts").findOne({
          phoneNumberId: String(phoneNumberId),
          status: "connected",
        });

        if (!account) {
          console.error(
            "WEBHOOK ERROR: No connected Wavo account found.",
            "Phone Number ID:",
            phoneNumberId,
          );

          continue;
        }

        console.log("8. Wavo workspace found:", String(account.workspaceId));

        for (const message of value.messages || []) {
          console.log("9. Processing incoming message:", message.id);

          await processIncomingMessage(db, account, value, message);

          console.log("10. Incoming message saved:", message.id);
        }

        for (const status of value.statuses || []) {
          console.log("Processing message status:", status.id);

          await processStatus(db, account, status);
        }
      }
    }

    console.log("========== WEBHOOK PROCESSING COMPLETE ==========\n");

    return NextResponse.json({
      success: true,
      message: "Webhook processed.",
    });
  } catch (error) {
    console.error("========== WEBHOOK ERROR ==========");
    console.error(error);
    console.error("===================================\n");

    return NextResponse.json(
      { success: false, message: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
