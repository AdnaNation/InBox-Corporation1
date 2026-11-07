import { ensureMongoIndex } from "./mongo-indexes.mjs";
import { ensureContactSuppressionIndex } from "./contact-suppression.mjs";

export async function ensureWhatsAppWebhookIndexes(db) {
  return Promise.all([
    ensureMongoIndex(db, "whatsappContacts", { workspaceId: 1, waId: 1 }, { unique: true }),
    ensureMongoIndex(db, "conversations", { workspaceId: 1, phoneNumberId: 1, waId: 1 }, { unique: true }),
    ensureMongoIndex(db, "messages", { workspaceId: 1, waMessageId: 1 }, { unique: true }),
    ensureMongoIndex(db, "messages", { workspaceId: 1, conversationId: 1, timestamp: -1 }),
    ensureContactSuppressionIndex(db),
  ]);
}
