import { ObjectId } from "mongodb";

export function buildContactHistoryFilter(workspaceId, cursor = null) {
  const filter = { workspaceId };
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: new ObjectId(cursor.id) } },
    ];
  }
  return filter;
}

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


export function escapeContactSearchQuery(value) {
  const specialCharacters = new Set(["\\\\", "^", "$", ".", "*", "+", "?", "(", ")", "[", "]", "{", "}", "|"]);
  return Array.from(String(value ?? ""), (character) =>
    specialCharacters.has(character) ? `\\\\${character}` : character
  ).join("");
}

export function buildContactQueryFilter(workspaceId, { cursor = null, query = "", tag = "" } = {}) {
  const clauses = [buildContactHistoryFilter(workspaceId, cursor)];
  const normalizedQuery = typeof query === "string" ? query.trim().slice(0, 100) : "";
  const normalizedTag = typeof tag === "string" ? tag.trim().toLowerCase().slice(0, 30) : "";

  if (normalizedQuery) {
    const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const phoneQuery = normalizedQuery.replace(/\D/g, "");
    const searchConditions = [{ name: { $regex: escapedQuery, $options: "i" } }];
    if (phoneQuery) searchConditions.push({ phone: { $regex: phoneQuery } });
    clauses.push({ $or: searchConditions });
  }
  if (normalizedTag) clauses.push({ tags: normalizedTag });
  return { $and: clauses };
}
