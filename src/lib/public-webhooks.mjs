import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_EVENT_TYPES = ["message.received", "message.status_updated"];

let indexesPromise;
async function ensureIndexes(db) {
  if (!indexesPromise) indexesPromise = Promise.all([
    db.collection("webhookSubscriptions").createIndex({ workspaceId: 1, status: 1, events: 1 }),
    db.collection("webhookDeliveries").createIndex({ subscriptionId: 1, eventId: 1 }, { unique: true }),
    db.collection("webhookDeliveries").createIndex({ status: 1, nextAttemptAt: 1, leaseUntil: 1 }),
  ]).catch((error) => { indexesPromise = null; throw error; });
  return indexesPromise;
}

export function isValidWebhookTarget(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && !url.hash
      && !url.hostname.endsWith(".")
      && !["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())
      && !/\.(local|internal|test|localhost|invalid)$/i.test(url.hostname)
      && !/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)
      && !url.hostname.includes(":");
  } catch {
    return false;
  }
}

export function signWebhookPayload(secret, rawBody, timestamp) {
  return createHmac("sha256", secret).update(String(timestamp) + "." + rawBody).digest("hex");
}

export function verifyWebhookSignature(secret, rawBody, timestamp, signature) {
  if (!/^\d{10,13}$/.test(String(timestamp)) || !/^[a-f0-9]{64}$/i.test(String(signature))) return false;
  const expected = Buffer.from(signWebhookPayload(secret, rawBody, timestamp), "hex");
  const received = Buffer.from(String(signature), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function enqueueWebhookEvent(db, workspaceId, type, data, eventId) {
  if (!WEBHOOK_EVENT_TYPES.includes(type) || !eventId) return { queued: 0 };
  await ensureIndexes(db);
  const now = new Date();
  const event = { id: String(eventId), type, createdAt: now.toISOString(), data };
  const subscriptions = await db.collection("webhookSubscriptions").find({
    workspaceId, status: "active", events: type,
  }, { projection: { _id: 1 } }).toArray();
  if (!subscriptions.length) return { queued: 0 };
  const operations = subscriptions.map((subscription) => ({
    updateOne: {
      filter: { subscriptionId: subscription._id, eventId: event.id },
      update: { $setOnInsert: {
        subscriptionId: subscription._id, workspaceId, eventId: event.id, event,
        status: "pending", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now,
      } },
      upsert: true,
    },
  }));
  try {
    await db.collection("webhookDeliveries").bulkWrite(operations, { ordered: false });
  } catch (error) {
    // A concurrent Meta retry may race the unique idempotency index.
    if (error.code !== 11000 && !error.writeErrors?.every((item) => item.code === 11000)) throw error;
  }
  return { queued: subscriptions.length };
}
