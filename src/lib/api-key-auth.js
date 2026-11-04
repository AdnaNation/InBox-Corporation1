import { createHash } from "node:crypto";
import { getDatabase } from "@/lib/db";

export function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function authenticateApiKey(request, requiredScope) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer (ibx_live_[A-Za-z0-9_-]+)$/);
  if (!match) return { error: "A valid Bearer API key is required.", status: 401 };

  const db = await getDatabase();
  const keyHash = hashApiKey(match[1]);
  const apiKey = await db.collection("apiKeys").findOne({
    keyHash,
    status: "active",
    revokedAt: { $exists: false },
  });

  if (!apiKey) return { error: "Invalid or revoked API key.", status: 401 };
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    return { error: "API key has expired.", status: 401 };
  }
  if (!apiKey.scopes?.includes(requiredScope)) {
    return { error: `This key does not have the ${requiredScope} permission.`, status: 403 };
  }

  await db.collection("apiKeys").updateOne(
    { _id: apiKey._id, status: "active" },
    { $set: { lastUsedAt: new Date() } },
  );
  return { apiKey };
}
