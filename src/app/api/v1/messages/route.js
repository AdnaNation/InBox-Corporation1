import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESSAGE_STATUSES = new Set(["received", "accepted", "sent", "delivered", "read", "failed"]);
const historyIndexByDb = new WeakMap();

async function ensureHistoryIndex(db) {
  let indexPromise = historyIndexByDb.get(db);
  if (!indexPromise) {
    indexPromise = db.collection("messages")
      .createIndex({ workspaceId: 1, timestamp: -1, _id: -1 }, { name: "public_api_message_history" })
      .catch((error) => {
        historyIndexByDb.delete(db);
        throw error;
      });
    historyIndexByDb.set(db, indexPromise);
  }
  await indexPromise;
}
const DIRECTIONS = new Set(["inbound", "outbound"]);

function decodeCursor(value) {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const timestamp = new Date(parsed.timestamp);
    if (!ObjectId.isValid(parsed.id) || !Number.isFinite(timestamp.getTime())) return null;
    return { id: new ObjectId(parsed.id), timestamp };
  } catch {
    return null;
  }
}

function encodeCursor(message) {
  return Buffer.from(JSON.stringify({
    timestamp: message.timestamp.toISOString(),
    id: message._id.toString(),
  })).toString("base64url");
}

export async function GET(request) {
  const auth = await authenticateApiKey(request, "messages:read");
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      {
        status: auth.status,
        headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") || 50);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json(
      { success: false, message: "The limit must be an integer between 1 and 100." },
      { status: 400 },
    );
  }

  const direction = searchParams.get("direction");
  if (direction && !DIRECTIONS.has(direction)) {
    return NextResponse.json({ success: false, message: "Direction must be inbound or outbound." }, { status: 400 });
  }
  const status = searchParams.get("status");
  if (status && !MESSAGE_STATUSES.has(status)) {
    return NextResponse.json({ success: false, message: "Status must be accepted, sent, delivered, read, or failed." }, { status: 400 });
  }

  const cursorValue = searchParams.get("before");
  const cursor = cursorValue ? decodeCursor(cursorValue) : null;
  if (cursorValue && !cursor) {
    return NextResponse.json({ success: false, message: "The before cursor is invalid." }, { status: 400 });
  }

  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const filter = { workspaceId };
  if (direction) filter.direction = direction;
  if (status) filter.status = status;
  if (cursor) {
    filter.$or = [
      { timestamp: { $lt: cursor.timestamp } },
      { timestamp: cursor.timestamp, _id: { $lt: cursor.id } },
    ];
  }

  const db = await getDatabase();
  try {
    await ensureHistoryIndex(db);
  } catch (error) {
    console.error("Public API message history index unavailable:", error);
    return NextResponse.json({ success: false, message: "Message history is temporarily unavailable." }, { status: 503 });
  }
  const records = await db.collection("messages")
    .find(filter)
    .sort({ timestamp: -1, _id: -1 })
    .limit(requestedLimit + 1)
    .project({
      waMessageId: 1,
      contactId: 1,
      phoneNumberId: 1,
      direction: 1,
      type: 1,
      templateName: 1,
      templateLanguage: 1,
      status: 1,
      error: 1,
      timestamp: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .toArray();

  const hasMore = records.length > requestedLimit;
  const page = records.slice(0, requestedLimit);
  const last = page[page.length - 1];

  return NextResponse.json({
    success: true,
    data: page.map((message) => ({
      messageId: message.waMessageId || null,
      contactId: message.contactId?.toString() || null,
      phoneNumberId: message.phoneNumberId || null,
      direction: message.direction || null,
      type: message.type || null,
      template: message.templateName
        ? { name: message.templateName, language: message.templateLanguage || null }
        : null,
      status: message.status || "unknown",
      error: message.error || null,
      timestamp: message.timestamp || null,
      createdAt: message.createdAt || null,
      updatedAt: message.updatedAt || null,
    })),
    pagination: {
      limit: requestedLimit,
      returned: page.length,
      hasMore,
      nextCursor: hasMore && last?.timestamp ? encodeCursor(last) : null,
    },
  });
}
