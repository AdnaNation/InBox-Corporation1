const suppressionIndexesByClient = new WeakMap();

export async function ensureContactSuppressionIndex(db) {
  // Db instances can be recreated by client.db() for each request. Cache by
  // client and database name so multiple databases on one client stay isolated.
  const cacheKey = db.client || db;
  const databaseName = db.databaseName || "";
  let indexesByDatabase = suppressionIndexesByClient.get(cacheKey);
  if (!indexesByDatabase) {
    indexesByDatabase = new Map();
    suppressionIndexesByClient.set(cacheKey, indexesByDatabase);
  }

  let indexPromise = indexesByDatabase.get(databaseName);
  if (!indexPromise) {
    indexPromise = (async () => {
      const collection = db.collection("contactSuppressions");
      let indexes = [];
      try {
        indexes = await collection.listIndexes().toArray();
      } catch (error) {
        // MongoDB raises NamespaceNotFound before the first suppression is
        // written. createIndex below safely creates the collection.
        if (error?.code !== 26 && error?.codeName !== "NamespaceNotFound") throw error;
      }
      const existing = indexes.some(
        (index) => index.key?.workspaceId === 1 && index.key?.phone === 1,
      );
      if (existing) return;
      const conflicting = indexes.some(
        (index) => index.key?.workspaceId === 1 && index.key?.phone === 1,
      );
      if (conflicting) throw new Error("The workspace/phone suppression index must be unique.");
      try {
        await collection.createIndex(
          { workspaceId: 1, phone: 1 },
          { unique: true },
        );
      } catch (error) {
        // Legacy duplicate rows must not make every send fail closed. Keep
        // the lookup index even when a unique migration cannot be applied.
        if (error?.code !== 11000 && error?.codeName !== "DuplicateKey") throw error;
        await collection.createIndex(
          { workspaceId: 1, phone: 1 },
          { name: "contact_suppression_workspace_phone" },
        );
      }
    })().catch((error) => {
      indexesByDatabase.delete(databaseName);
      if (!indexesByDatabase.size) suppressionIndexesByClient.delete(cacheKey);
      throw error;
    });
    indexesByDatabase.set(databaseName, indexPromise);
  }
  await indexPromise;
}

/**
 * Look up a durable opt-out suppression for one workspace/phone pair.
 * A missing active flag is treated as active for legacy suppression records.
 */
export async function findActiveContactSuppression(db, workspaceId, phone) {
  if (typeof phone !== "string" || !phone.trim()) return null;
  await ensureContactSuppressionIndex(db);
  return db.collection("contactSuppressions").findOne(
    { workspaceId, phone: phone.trim(), active: { $ne: false } },
    { projection: { _id: 1, reason: 1, optedOutAt: 1 } },
  );
}

/**
 * Return active workspace-level suppressions for audience filtering.
 */
export async function getActiveSuppressedPhones(db, workspaceId) {
  await ensureContactSuppressionIndex(db);
  const records = await db.collection("contactSuppressions")
    .find({ workspaceId, active: { $ne: false } })
    .project({ phone: 1 })
    .toArray();
  return [...new Set(records
    .map((record) => record.phone)
    .filter((phone) => typeof phone === "string" && phone.trim())
    .map((phone) => phone.trim()))];
}
