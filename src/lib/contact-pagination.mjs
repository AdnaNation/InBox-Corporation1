export function decodeContactCursor(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!/^[a-f0-9]{24}$/i.test(String(parsed.id || "")) || !Number.isFinite(createdAt.getTime())) return null;
    return { id: String(parsed.id), createdAt };
  } catch {
    return null;
  }
}

export function encodeContactCursor(contact) {
  const createdAt = contact?.createdAt instanceof Date
    ? contact.createdAt
    : new Date(contact?.createdAt);
  if (!contact?._id || !Number.isFinite(createdAt.getTime())) {
    throw new TypeError("A contact with an ID and valid createdAt timestamp is required.");
  }
  return Buffer.from(JSON.stringify({
    createdAt: createdAt.toISOString(),
    id: contact._id.toString(),
  })).toString("base64url");
}
