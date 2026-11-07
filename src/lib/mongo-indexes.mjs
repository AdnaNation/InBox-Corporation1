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
  let databases = indexesByClient.get(cacheKey);
  if (!databases) {
    databases = new Map();
    indexesByClient.set(cacheKey, databases);
  }

  let indexesByDefinition = databases.get(databaseName);
  if (!indexesByDefinition) {
    indexesByDefinition = new Map();
    databases.set(databaseName, indexesByDefinition);
  }

  const indexKey = JSON.stringify([collectionName, keys, options]);
  let indexPromise = indexesByDefinition.get(indexKey);
  if (!indexPromise) {
    indexPromise = db.collection(collectionName).createIndex(keys, options).catch((error) => {
      indexesByDefinition.delete(indexKey);
      if (!indexesByDefinition.size) databases.delete(databaseName);
      if (!databases.size) indexesByClient.delete(cacheKey);
      throw error;
    });
    indexesByDefinition.set(indexKey, indexPromise);
  }

  return indexPromise;
}
