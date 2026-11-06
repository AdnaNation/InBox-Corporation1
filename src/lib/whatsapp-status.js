import { enqueueWebhookEvent } from "@/lib/public-webhooks.mjs";

export async function applyPendingWhatsAppStatus(db, workspaceId, waMessageId) {
  const pendingCollection = db.collection("whatsappPendingStatuses");
  const messagesCollection = db.collection("messages");

  const pending = await pendingCollection.findOne({
    workspaceId,
    waMessageId,
  });

  if (!pending) return;

  // Apply the pending status without overwriting a newer status.
  await messagesCollection.updateOne(
    {
      workspaceId,
      waMessageId,
    },
    [
      {
        $set: {
          status: {
            $cond: [
              {
                $gte: [pending.statusRank, { $ifNull: ["$statusRank", 0] }],
              },
              pending.status,
              "$status",
            ],
          },

          statusRank: {
            $max: [{ $ifNull: ["$statusRank", 0] }, pending.statusRank],
          },

          statusUpdatedAt: {
            $cond: [
              {
                $gte: [pending.statusRank, { $ifNull: ["$statusRank", 0] }],
              },
              pending.statusUpdatedAt,
              "$statusUpdatedAt",
            ],
          },

          sentAt: pending.sentAt ? { $ifNull: [pending.sentAt, "$sentAt"] } : "$sentAt",
          deliveredAt: pending.deliveredAt ? { $ifNull: [pending.deliveredAt, "$deliveredAt"] } : "$deliveredAt",
          readAt: pending.readAt ? { $ifNull: [pending.readAt, "$readAt"] } : "$readAt",
          failedAt: pending.failedAt ? { $ifNull: [pending.failedAt, "$failedAt"] } : "$failedAt",

          error: {
            $cond: [
              {
                $gte: [pending.statusRank, { $ifNull: ["$statusRank", 0] }],
              },
              pending.error || "$$REMOVE",
              "$error",
            ],
          },
        },
      },
    ],
  );

  // Queue first so a failed outbox write leaves the pending status available
  // for reconciliation on a later attempt. Normalize the event ID to Meta's
  // Unix-second timestamp so this path deduplicates with the direct webhook path.
  const statusDate = new Date(pending.statusUpdatedAt || Date.now());
  const statusEpoch = Math.floor(statusDate.getTime() / 1000);
  await enqueueWebhookEvent(db, workspaceId, "message.status_updated", {
    messageId: waMessageId,
    status: pending.status,
    timestamp: statusDate.toISOString(),
  }, "whatsapp-status-" + waMessageId + "-" + pending.status + "-" + String(statusEpoch));

  // Delete only the pending version we just processed.
  await pendingCollection.deleteOne({
    workspaceId,
    waMessageId,
    statusRank: pending.statusRank,
    statusUpdatedAt: pending.statusUpdatedAt,
  });
}
