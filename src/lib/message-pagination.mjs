import { ObjectId } from "mongodb";

export function decodeMessageCursor(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const timestamp = new Date(parsed.timestamp);
    if (typeof parsed.id !== "string" || !/^[a-f0-9]{24}$/i.test(parsed.id) || !Number.isFinite(timestamp.getTime())) return null;
    return { id: new ObjectId(parsed.id), timestamp };
  } catch {
    return null;
  }
}

export function encodeMessageCursor(message) {
  const timestamp = message?.timestamp instanceof Date ? message.timestamp : new Date(message?.timestamp);
  if (!message?._id || !Number.isFinite(timestamp.getTime())) {
    throw new TypeError("A message with an ID and valid timestamp is required.");
  }
  return Buffer.from(JSON.stringify({
    timestamp: timestamp.toISOString(),
    id: message._id.toString(),
  })).toString("base64url");
}
