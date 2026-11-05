/**
 * Ensure database-enforced WhatsApp account invariants.
 *
 * The partial unique indexes are the source of truth for concurrency:
 * - at most one active connected number per workspace;
 * - a connected Phone Number ID can belong to only one Wavo workspace.
 *
 * Existing duplicate active flags are normalized deterministically before
 * the active index is created. Duplicate connected Phone Number IDs across
 * workspaces intentionally fail closed instead of silently disconnecting or
 * moving a customer's number.
 */
export async function ensureWhatsAppAccountIndexes(db) {
  const accounts = db.collection("whatsappAccounts");
  const indexes = await accounts.listIndexes().toArray();
  const indexNames = new Set(indexes.map((index) => index.name));

  if (!indexNames.has("uniq_connected_active_whatsapp_per_workspace")) {
    const connected = await accounts
      .find({ status: "connected" })
      .sort({ workspaceId: 1, createdAt: 1, _id: 1 })
      .project({ workspaceId: 1, isActive: 1 })
      .toArray();

    const workspaces = new Map();
    for (const account of connected) {
      const key = account.workspaceId?.toString();
      if (!key) continue;
      if (!workspaces.has(key)) workspaces.set(key, []);
      workspaces.get(key).push(account);
    }

    for (const workspaceAccounts of workspaces.values()) {
      const selected =
        workspaceAccounts.find((account) => account.isActive === true) ||
        workspaceAccounts[0];

      await accounts.updateMany(
        { workspaceId: selected.workspaceId, status: "connected" },
        { $set: { isActive: false } },
      );
      await accounts.updateOne(
        { _id: selected._id, workspaceId: selected.workspaceId, status: "connected" },
        { $set: { isActive: true } },
      );
    }

    await accounts.createIndex(
      { workspaceId: 1 },
      {
        name: "uniq_connected_active_whatsapp_per_workspace",
        unique: true,
        partialFilterExpression: { status: "connected", isActive: true },
      },
    );
  }

  if (!indexNames.has("uniq_connected_whatsapp_phone_number_id")) {
    await accounts.createIndex(
      { phoneNumberId: 1 },
      {
        name: "uniq_connected_whatsapp_phone_number_id",
        unique: true,
        partialFilterExpression: {
          status: "connected",
          phoneNumberId: { $type: "string" },
        },
      },
    );
  }
}

/**
 * Resolve the workspace's selected WhatsApp account.
 *
 * Legacy workspaces are normalized by ensureWhatsAppAccountIndexes. A
 * supplied phoneNumberId always resolves that exact connected account,
 * regardless of which number is currently selected for new work.
 */
export async function getActiveWhatsAppAccount(db, workspaceId, phoneNumberId = null) {
  await ensureWhatsAppAccountIndexes(db);
  const accounts = db.collection("whatsappAccounts");

  if (phoneNumberId) {
    return accounts.findOne({ workspaceId, phoneNumberId, status: "connected" });
  }

  return accounts.findOne({
    workspaceId,
    status: "connected",
    isActive: true,
  });
}
