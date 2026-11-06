// Cache index initialization per MongoDB Db instance so concurrent requests
// share one operation and normal note reads avoid repeated index checks.
const initializationByDb = new WeakMap();

export function ensureConversationNoteIndexes(db) {
  let initialization = initializationByDb.get(db);
  if (!initialization) {
    initialization = db.collection("conversationNotes").createIndex(
      { workspaceId: 1, conversationId: 1, createdAt: 1, _id: 1 },
      { name: "workspace_conversation_notes_timeline" },
    );
    initializationByDb.set(db, initialization);
    initialization.catch(() => {
      if (initializationByDb.get(db) === initialization) {
        initializationByDb.delete(db);
      }
    });
  }
  return initialization;
}
