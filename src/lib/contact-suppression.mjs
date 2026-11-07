const suppressionIndexByDb = new WeakMap();

async function ensureSuppressionIndex(db) {
  // Db instances can be recreated by client.db() for each request. Cache by
  // the shared MongoClient so createIndex is not repeated on every send.
  const cacheKey = db.client || db;
  let indexPromise = suppressionIndexByDb.get(cacheKey);
  if (!indexPromise) {
    indexPromise = db.collection("contactSuppressions")
      .createIndex(
        { workspaceId: 1, phone: 1 },
        { name: "contact_suppression_workspace_phone" },
      )
      .catch((error) => {
        suppressionIndexByDb.delete(cacheKey);
        throw error;
      });
    suppressionIndexByDb.set(cacheKey, indexPromise);
  }
  await indexPromise;
}

/**
 * Look up a durable opt-out suppression for one workspace/phone pair.
 * A missing active flag is treated as active for legacy suppression records.
 */
export async function findActiveContactSuppression(db, workspaceId, phone) {
  if (typeof phone !== "string" || !phone.trim()) return null;
  await ensureSuppressionIndex(db);
  return db.collection("contactSuppressions").findOne(
    { workspaceId, phone: phone.trim(), active: { $ne: false } },
    { projection: { _id: 1, reason: 1, optedOutAt: 1 } },
  );
}

/**
 * Return active workspace-level suppressions for audience filtering.
 */
export async function getActiveSuppressedPhones(db, workspaceId) {
  await ensureSuppressionIndex(db);
  const records = await db.collection("contactSuppressions")
    .find({ workspaceId, active: { $ne: false } })
    .project({ phone: 1 })
    .toArray();
  return [...new Set(records
    .map((record) => record.phone)
    .filter((phone) => typeof phone === "string" && phone.trim())
    .map((phone) => phone.trim()))];
}
