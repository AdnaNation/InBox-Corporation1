const indexesByClient = new WeakMap();

/**
 * Ensure one MongoDB index per client/database/collection/index definition.
 * Db handles may be recreated for each request, so caching by Db object alone
 * causes repeated index commands. A process-global promise can instead bind
 * the wrong database in tests or multi-database processes.
 */
export async function ensureMongoIndex(db, collectionName, keys, options = {}) {
  const cacheKey = db.client || db;
  const databaseName = db.databaseName || "";
  let indexesByDatabase = indexesByClient.get(cacheKey);
  if (!indexesByDatabase) {
    indexesByDatabase = new Map();
    indexesByClient.set(cacheKey, indexesByDatabase);
  }

  const indexKey = JSON.stringify([collectionName, keys, options]);
  let indexPromise = indexesByDatabase.get(indexKey);
  if (!indexPromise) {
    indexPromise = db.collection(collectionName).createIndex(keys, options).catch((error) => {
      indexesByDatabase.delete(indexKey);
      if (!indexesByDatabase.size) indexesByClient.delete(cacheKey);
      throw error;
    });
    indexesByDatabase.set(indexKey, indexPromise);
  }

  return indexPromise;
}
