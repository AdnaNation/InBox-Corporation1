import { ensureMongoIndex } from "./mongo-indexes.mjs";

export async function ensureWhatsAppWebhookIndexes(db) {
  return Promise.all([
    ensureMongoIndex(db, "whatsappContacts", { workspaceId: 1, waId: 1 }, { unique: true }),
    ensureMongoIndex(db, "conversations", { workspaceId: 1, phoneNumberId: 1, waId: 1 }, { unique: true }),
    ensureMongoIndex(db, "messages", { workspaceId: 1, waMessageId: 1 }, { unique: true }),
    ensureMongoIndex(db, "messages", { workspaceId: 1, conversationId: 1, timestamp: -1 }),
    ensureMongoIndex(db, "contactSuppressions", { workspaceId: 1, phone: 1 }, { unique: true }).catch(async (error) => {
      if (error?.code !== 11000 && error?.codeName !== "DuplicateKey") throw error;
      return ensureMongoIndex(db, "contactSuppressions", { workspaceId: 1, phone: 1 }, {
        name: "contact_suppression_workspace_phone",
      });
    }),
  ]);
}
