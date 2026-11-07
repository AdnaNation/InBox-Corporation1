import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { ensureMongoIndex } from "@/lib/mongo-indexes.mjs";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { encryptSecret } from "@/lib/crypto";
import { WEBHOOK_EVENT_TYPES, isValidWebhookTarget } from "@/lib/public-webhooks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureIndexes(db) {
  await Promise.all([
    ensureMongoIndex(db, "webhookSubscriptions", { workspaceId: 1, createdAt: -1 }),
    ensureMongoIndex(db, "webhookDeliveries", { subscriptionId: 1, eventId: 1 }, { unique: true }),
    ensureMongoIndex(db, "webhookDeliveries", { status: 1, nextAttemptAt: 1, leaseUntil: 1 }),
    ensureMongoIndex(db, "webhookDeliveries", { workspaceId: 1, createdAt: -1 }),
  ]);
}

export async function GET(request) {
  const auth = await authenticateApiKey(request, "webhooks:read");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });
  const db = await getDatabase();
  await ensureIndexes(db);
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const subscriptions = await db.collection("webhookSubscriptions").find(
    { workspaceId },
    { projection: { url: 1, description: 1, events: 1, status: 1, createdAt: 1, updatedAt: 1, lastDeliveryAt: 1 } },
  ).sort({ createdAt: -1 }).limit(100).toArray();
  return NextResponse.json({ success: true, data: subscriptions.map((item) => ({
    id: item._id.toString(), url: item.url, description: item.description || "",
    events: item.events || [], status: item.status, createdAt: item.createdAt,
    updatedAt: item.updatedAt || null, lastDeliveryAt: item.lastDeliveryAt || null,
  })) });
}

export async function POST(request) {
  const auth = await authenticateApiKey(request, "webhooks:write");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Request body must be a JSON object." }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 120) : "";
  const events = Array.isArray(body.events) ? [...new Set(body.events)] : [];
  if (!isValidWebhookTarget(url)) {
    return NextResponse.json({ success: false, message: "Webhook URL must be a valid HTTPS URL on the standard port, without credentials or a local/IP address." }, { status: 400 });
  }
  if (!events.length || events.some((event) => !WEBHOOK_EVENT_TYPES.includes(event))) {
    return NextResponse.json({ success: false, message: "Choose one or more supported events: " + WEBHOOK_EVENT_TYPES.join(", ") + "." }, { status: 400 });
  }
  const db = await getDatabase();
  await ensureIndexes(db);
  const now = new Date();
  const secret = "whsec_" + randomBytes(32).toString("base64url");
  const result = await db.collection("webhookSubscriptions").insertOne({
    workspaceId: new ObjectId(auth.apiKey.workspaceId),
    createdByApiKeyId: new ObjectId(auth.apiKey._id),
    url, description, events, secretEncrypted: encryptSecret(secret),
    status: "active", createdAt: now, updatedAt: now,
  });
  return NextResponse.json({
    success: true,
    data: { id: result.insertedId.toString(), url, description, events, status: "active", createdAt: now },
    secret,
    message: "Save this signing secret now. It is shown only once.",
  }, { status: 201 });
}
