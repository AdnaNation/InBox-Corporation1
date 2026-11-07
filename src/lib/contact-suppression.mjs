/**
 * Look up a durable opt-out suppression for one workspace/phone pair.
 * A missing active flag is treated as active for legacy suppression records.
 */
export async function findActiveContactSuppression(db, workspaceId, phone) {
  if (typeof phone !== "string" || !phone.trim()) return null;
  return db.collection("contactSuppressions").findOne(
    { workspaceId, phone: phone.trim(), active: { $ne: false } },
    { projection: { _id: 1, reason: 1, optedOutAt: 1 } },
  );
}

/**
 * Return active workspace-level suppressions for audience filtering.
 */
export async function getActiveSuppressedPhones(db, workspaceId) {
  const records = await db.collection("contactSuppressions")
    .find({ workspaceId, active: { $ne: false } })
    .project({ phone: 1 })
    .toArray();
  return [...new Set(records
    .map((record) => record.phone)
    .filter((phone) => typeof phone === "string" && phone.trim())
    .map((phone) => phone.trim()))];
}
