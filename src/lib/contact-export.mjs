export function escapeCsvCell(value) {
  const text = String(value ?? "");
  const safeText = /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function serializeContactCsvRow(contact) {
  const optIn = contact.optIn || {};
  const formatDate = (value) => value instanceof Date
    ? value.toISOString()
    : value || "";
  return [
    contact.name,
    contact.phone,
    Array.isArray(contact.tags) ? contact.tags.join("; ") : "",
    optIn.status === true ? "Yes" : "No",
    optIn.consentSource || optIn.source || "",
    optIn.evidence || "",
    formatDate(optIn.date),
    formatDate(optIn.revokedAt),
    optIn.revocationSource || "",
    formatDate(contact.createdAt),
  ].map(escapeCsvCell).join(",");
}
