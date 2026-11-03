import { getDatabase } from "@/lib/db";

let indexesPromise;

export async function initializeDatabase() {
  if (!indexesPromise) {
    indexesPromise = (async () => {
      const db = await getDatabase();

      await Promise.all([
        db.collection("users").createIndex({ email: 1 }, { unique: true }),

        db.collection("workspaces").createIndex({ slug: 1 }, { unique: true }),

        db
          .collection("memberships")
          .createIndex({ workspaceId: 1, userId: 1 }, { unique: true }),

        db
          .collection("contacts")
          .createIndex({ workspaceId: 1, phone: 1 }, { unique: true }),

        db.collection("contacts").createIndex({ workspaceId: 1, name: 1 }),

        db
          .collection("whatsappAccounts")
          .createIndex(
            { workspaceId: 1, phoneNumberId: 1 },
            { unique: true, sparse: true },
          ),

        db
          .collection("messages")
          .createIndex({ workspaceId: 1, createdAt: -1 }),

        // NEW: Pending WhatsApp message statuses
        db
          .collection("whatsappPendingStatuses")
          .createIndex({ workspaceId: 1, waMessageId: 1 }, { unique: true }),

        db
          .collection("webhookEvents")
          .createIndex({ eventId: 1 }, { unique: true }),
        db
          .collection("groups")
          .createIndex({ workspaceId: 1, nameKey: 1 }, { unique: true }),

        db.collection("groups").createIndex({
          workspaceId: 1,
          createdAt: -1,
        }),
      ]);

      return true;
    })().catch((error) => {
      indexesPromise = null;
      throw error;
    });
  }

  return indexesPromise;
}
