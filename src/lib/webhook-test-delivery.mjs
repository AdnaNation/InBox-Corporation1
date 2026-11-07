import { randomUUID } from "node:crypto";

export async function queueWebhookTestDelivery(db, { workspaceId, subscriptionId, now = new Date(), eventId = `evt_test_${randomUUID()}` }) {
  const subscription = await db.collection("webhookSubscriptions").findOne({
    _id: subscriptionId,
    workspaceId,
    status: "active",
    secretEncrypted: { $exists: true, $ne: "" },
  }, { projection: { _id: 1 } });

  if (!subscription) return null;

  const event = {
    id: eventId,
    type: "webhook.test",
    createdAt: now.toISOString(),
    data: {
      message: "Wavo test delivery. Your endpoint received a signed test event.",
      test: true,
    },
  };
  const result = await db.collection("webhookDeliveries").insertOne({
    subscriptionId,
    workspaceId,
    eventId,
    event,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return { deliveryId: result.insertedId.toString(), eventId, status: "pending" };
}
