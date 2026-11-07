export async function retryFailedWebhookDelivery(db, { workspaceId, subscriptionId, deliveryId, now = new Date() }) {
  const subscription = await db.collection("webhookSubscriptions").findOne({
    _id: subscriptionId,
    workspaceId,
    status: "active",
    secretEncrypted: { $exists: true, $ne: "" },
  }, { projection: { _id: 1 } });

  if (!subscription) return { retried: false, reason: "subscription_not_found" };

  const result = await db.collection("webhookDeliveries").updateOne(
    {
      _id: deliveryId,
      subscriptionId,
      workspaceId,
      status: "failed",
    },
    {
      $set: {
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        manualRetryAt: now,
        updatedAt: now,
      },
      $unset: {
        failedAt: "",
        lastError: "",
        responseStatus: "",
        deliveredAt: "",
        leaseOwner: "",
        leaseUntil: "",
      },
    },
  );

  return result.matchedCount === 1
    ? { retried: true }
    : { retried: false, reason: "delivery_not_retryable" };
}
