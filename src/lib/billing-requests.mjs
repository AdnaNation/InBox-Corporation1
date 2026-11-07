const indexByConnection = new WeakMap();

export function ensureBillingRequestIndexes(db) {
  const connection = db.client || db;
  let indexPromise = indexByConnection.get(connection);
  if (!indexPromise) {
    indexPromise = db.collection("billingRequests").createIndex(
      { workspaceId: 1 },
      {
        name: "one_pending_billing_request_per_workspace",
        unique: true,
        partialFilterExpression: { status: "pending" },
      },
    ).catch((error) => {
      indexByConnection.delete(connection);
      throw error;
    });
    indexByConnection.set(connection, indexPromise);
  }
  return indexPromise;
}
