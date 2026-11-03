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

  // Delete only the pending version we just processed.
  await pendingCollection.deleteOne({
    workspaceId,
    waMessageId,
    statusRank: pending.statusRank,
    statusUpdatedAt: pending.statusUpdatedAt,
  });
}
