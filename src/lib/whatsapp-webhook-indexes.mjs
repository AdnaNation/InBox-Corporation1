import { ensureContactSuppressionIndex } from "./contact-suppression.mjs";

const indexesByClient = new WeakMap();

export async function ensureWhatsAppWebhookIndexes(db) {
  // The MongoDB driver can create a new Db handle for each request. Keep the
  // promise scoped to both the underlying client and database name.
  const cacheKey = db.client || db;
  const databaseName = db.databaseName || "";
  let indexesByDatabase = indexesByClient.get(cacheKey);
  if (!indexesByDatabase) {
    indexesByDatabase = new Map();
    indexesByClient.set(cacheKey, indexesByDatabase);
  }

  let indexPromise = indexesByDatabase.get(databaseName);
  if (!indexPromise) {
    indexPromise = Promise.all([
      db.collection("whatsappContacts").createIndex(
        { workspaceId: 1, waId: 1 },
        { unique: true },
      ),
      db.collection("conversations").createIndex(
        { workspaceId: 1, phoneNumberId: 1, waId: 1 },
        { unique: true },
      ),
      db.collection("messages").createIndex(
        { workspaceId: 1, waMessageId: 1 },
        { unique: true },
      ),
      db.collection("messages").createIndex(
        { workspaceId: 1, conversationId: 1, timestamp: -1 },
      ),
      ensureContactSuppressionIndex(db),
    ]).catch((error) => {
      indexesByDatabase.delete(databaseName);
      if (!indexesByDatabase.size) indexesByClient.delete(cacheKey);
      throw error;
    });
    indexesByDatabase.set(databaseName, indexPromise);
  }

  return indexPromise;
}
