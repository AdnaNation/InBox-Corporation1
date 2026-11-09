/**
 * Validate that a signed Meta webhook entry belongs to the stored WABA
 * connection selected by its phone number. Legacy records without a WABA ID
 * remain routable; records with a WABA ID must match the entry exactly.
 */
export function matchesWhatsAppWebhookAccount(account, entryWabaId, phoneNumberId) {
  if (!account || !phoneNumberId) return false;
  if (String(account.phoneNumberId || "") !== String(phoneNumberId)) return false;
  if (account.wabaId && String(account.wabaId) !== String(entryWabaId || "")) return false;
  return true;
}
