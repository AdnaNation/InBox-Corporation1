const indexByConnection = new WeakMap();

export const WORKSPACE_DATA_REQUEST_TYPES = Object.freeze(["export", "deletion"]);
export const WORKSPACE_DATA_REQUEST_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["in_review", "rejected"]),
  in_review: Object.freeze(["completed", "rejected"]),
});

export function canTransitionWorkspaceDataRequest(currentStatus, nextStatus) {
  return WORKSPACE_DATA_REQUEST_TRANSITIONS[currentStatus]?.includes(nextStatus) === true;
}

export function ensureWorkspaceDataRequestIndexes(db) {
  const connection = db.client || db;
  let indexPromise = indexByConnection.get(connection);
  if (!indexPromise) {
    indexPromise = db.collection("workspaceDataRequests").createIndex(
      { workspaceId: 1, type: 1 },
      {
        name: "one_active_data_request_per_workspace_type",
        unique: true,
        partialFilterExpression: { active: true },
      },
    ).then(async (name) => {
      await db.collection("workspaceDataRequests").createIndex(
        { workspaceId: 1, createdAt: -1 },
        { name: "workspace_data_request_history" },
      );
      return name;
    }).catch((error) => {
      indexByConnection.delete(connection);
      throw error;
    });
    indexByConnection.set(connection, indexPromise);
  }
  return indexPromise;
}
