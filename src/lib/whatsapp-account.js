/**
 * Resolve the workspace's selected WhatsApp account.
 *
 * Existing workspaces may have a single connected account created before
 * multi-number support, without an isActive flag. The oldest connection is
 * promoted once as a backwards-compatible default.
 */
export async function getActiveWhatsAppAccount(db, workspaceId, phoneNumberId = null) {
  const accounts = db.collection("whatsappAccounts");

  if (phoneNumberId) {
    return accounts.findOne({ workspaceId, phoneNumberId, status: "connected" });
  }

  let account = await accounts.findOne({
    workspaceId,
    status: "connected",
    isActive: true,
  });

  if (account) return account;

  account = await accounts.findOne(
    { workspaceId, status: "connected" },
    { sort: { createdAt: 1 } },
  );

  if (!account) return null;

  await accounts.updateOne(
    { _id: account._id, workspaceId, status: "connected" },
    { $set: { isActive: true, updatedAt: new Date() } },
  );

  return { ...account, isActive: true };
}
