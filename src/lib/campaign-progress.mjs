export const CAMPAIGN_RECIPIENT_STATUSES = [
  "pending",
  "processing",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
  "unknown",
  "skipped",
];

export function summarizeCampaignRecipientStatuses(rows, recipientCount) {
  const counts = Object.fromEntries(
    CAMPAIGN_RECIPIENT_STATUSES.map((status) => [status, 0]),
  );

  for (const row of rows || []) {
    if (Object.hasOwn(counts, row?._id)) {
      counts[row._id] = Number.isSafeInteger(row.count) && row.count >= 0
        ? row.count
        : 0;
    }
  }

  const actualTotal = CAMPAIGN_RECIPIENT_STATUSES.reduce(
    (sum, status) => sum + counts[status],
    0,
  );
  const total = Number.isSafeInteger(recipientCount) && recipientCount >= 0
    ? recipientCount
    : actualTotal;
  const finished = counts.pending === 0 && counts.processing === 0;
  const hasIssues = counts.failed + counts.unknown + counts.skipped > 0;

  return {
    total,
    counts,
    finished,
    status: finished ? (hasIssues ? "completed_with_issues" : "completed") : "sending",
  };
}

/**
 * Reconcile campaign-level progress after a Meta delivery-status webhook.
 * Campaigns can finish their send loop before Meta sends delivered/read/failed
 * callbacks, so the aggregate status must be refreshed when those callbacks
 * arrive later.
 */
export async function refreshCampaignProgress(db, workspaceId, campaignId) {
  const campaigns = db.collection("campaigns");
  const campaign = await campaigns.findOne(
    {
      _id: campaignId,
      workspaceId,
      status: { $in: ["sending", "completed", "completed_with_issues"] },
    },
    { projection: { status: 1, recipientCount: 1, completedAt: 1 } },
  );

  if (!campaign) return null;

  const rows = await db.collection("campaignRecipients").aggregate([
    { $match: { workspaceId, campaignId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]).toArray();

  const summary = summarizeCampaignRecipientStatuses(rows, campaign.recipientCount);
  const now = new Date();
  const update = {
    progress: { total: summary.total, ...summary.counts },
    updatedAt: now,
  };

  if (summary.finished) {
    update.status = summary.status;
    update.completedAt = campaign.completedAt || now;
  }

  await campaigns.updateOne(
    {
      _id: campaignId,
      workspaceId,
      status: { $in: ["sending", "completed", "completed_with_issues"] },
    },
    { $set: update },
  );

  return summary;
}
