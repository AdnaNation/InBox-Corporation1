import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { decodeWebhookDeliveryCursor, encodeWebhookDeliveryCursor } from "@/lib/webhook-delivery-pagination.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const historyIndexByDb = new WeakMap();

async function ensureHistoryIndex(db) {
  let indexPromise = historyIndexByDb.get(db);
  if (!indexPromise) {
    indexPromise = db.collection("webhookDeliveries")
      .createIndex(
        { workspaceId: 1, subscriptionId: 1, createdAt: -1, _id: -1 },
        { name: "public_api_webhook_delivery_history" },
      )
      .catch((error) => {
        historyIndexByDb.delete(db);
        throw error;
      });
    historyIndexByDb.set(db, indexPromise);
  }
  await indexPromise;
}

export async function GET(request, { params }) {
  const auth = await authenticateApiKey(request, "webhooks:read");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) {
    return NextResponse.json({ success: false, message: "A valid webhook subscription ID is required." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const requestedLimit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json({ success: false, message: "The limit must be an integer between 1 and 100." }, { status: 400 });
  }

  const cursorValue = searchParams.get("before");
  const cursor = cursorValue ? decodeWebhookDeliveryCursor(cursorValue) : null;
  if (cursorValue && !cursor) {
    return NextResponse.json({ success: false, message: "The before cursor is invalid." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const subscriptionId = new ObjectId(id);
  const subscription = await db.collection("webhookSubscriptions").findOne(
    { _id: subscriptionId, workspaceId },
    { projection: { _id: 1 } },
  );
  if (!subscription) {
    return NextResponse.json({ success: false, message: "Webhook subscription not found." }, { status: 404 });
  }

  try {
    await ensureHistoryIndex(db);
  } catch (error) {
    console.error("Public API webhook delivery history index unavailable:", error);
    return NextResponse.json({ success: false, message: "Webhook delivery history is temporarily unavailable." }, { status: 503 });
  }

  const filter = { subscriptionId, workspaceId };
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: new ObjectId(cursor.id) } },
    ];
  }
  const records = await db.collection("webhookDeliveries")
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(requestedLimit + 1)
    .project({
      eventId: 1, event: 1, status: 1, attempts: 1, responseStatus: 1,
      lastError: 1, createdAt: 1, deliveredAt: 1, nextAttemptAt: 1,
    })
    .toArray();

  const hasMore = records.length > requestedLimit;
  const page = records.slice(0, requestedLimit);
  const last = page[page.length - 1];

  return NextResponse.json({
    success: true,
    data: page.map((item) => ({
      id: item._id.toString(), eventId: item.eventId, type: item.event?.type || "unknown",
      status: item.status, attempts: item.attempts || 0, responseStatus: item.responseStatus || null,
      lastError: item.lastError || null, createdAt: item.createdAt,
      deliveredAt: item.deliveredAt || null, nextAttemptAt: item.nextAttemptAt || null,
    })),
    pagination: {
      limit: requestedLimit,
      returned: page.length,
      hasMore,
      nextCursor: hasMore && last?.createdAt ? encodeWebhookDeliveryCursor(last) : null,
    },
  });
}
