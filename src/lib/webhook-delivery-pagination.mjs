import { ObjectId } from "mongodb";

export function decodeWebhookDeliveryCursor(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!/^[a-f0-9]{24}$/i.test(String(parsed.id || "")) || !Number.isFinite(createdAt.getTime())) return null;
    return { id: String(parsed.id), createdAt };
  } catch {
    return null;
  }
}

export function encodeWebhookDeliveryCursor(delivery) {
  const createdAt = delivery?.createdAt instanceof Date
    ? delivery.createdAt
    : new Date(delivery?.createdAt);
  if (!delivery?._id || !Number.isFinite(createdAt.getTime())) {
    throw new TypeError("A delivery with an ID and valid createdAt timestamp is required.");
  }
  return Buffer.from(JSON.stringify({
    createdAt: createdAt.toISOString(),
    id: delivery._id.toString(),
  })).toString("base64url");
}


const historyIndexByDb = new WeakMap();

export function ensureWebhookDeliveryHistoryIndex(db) {
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
  return indexPromise;
}

export function buildWebhookDeliveryHistoryFilter(subscriptionId, workspaceId, cursor = null) {
  const filter = { subscriptionId, workspaceId };
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: new ObjectId(cursor.id) } },
    ];
  }
  return filter;
}
