export function escapeCsvCell(value) {
  const text = String(value ?? "");
  const safeText = /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function serializeContactCsvRow(contact) {
  return [
    contact.name,
    contact.phone,
    Array.isArray(contact.tags) ? contact.tags.join("; ") : "",
    contact.optIn?.status === true ? "Yes" : "No",
    contact.createdAt instanceof Date
      ? contact.createdAt.toISOString()
      : contact.createdAt || "",
  ].map(escapeCsvCell).join(",");
}
