import { createHash } from "node:crypto";
import { consumeApiRateLimit } from "./api-rate-limit.mjs";

export function hashApiKey(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function authenticateApiKeyWithDb(request, requiredScope, getDatabase) {
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

  // Session authentication already rejects suspended workspaces. Public API
  // keys must enforce the same boundary or a suspended tenant can keep using
  // integrations after its dashboard access has been disabled.
  const workspace = await db.collection("workspaces").findOne(
    { _id: apiKey.workspaceId, status: "active" },
    { projection: { _id: 1 } },
  );
  if (!workspace) {
    return { error: "This workspace is inactive or suspended.", status: 403 };
  }

  if (!apiKey.scopes?.includes(requiredScope)) {
    return { error: `This key does not have the ${requiredScope} permission.`, status: 403 };
  }

  let rateLimit;
  try {
    rateLimit = await consumeApiRateLimit(db, apiKey._id);
  } catch (error) {
    console.error("Public API rate-limit check failed:", error);
    return { error: "API temporarily unavailable. Please retry shortly.", status: 503 };
  }

  await db.collection("apiKeys").updateOne(
    { _id: apiKey._id, status: "active" },
    { $set: { lastUsedAt: new Date() } },
  );

  if (!rateLimit.allowed) {
    return {
      error: "API rate limit exceeded. Wait before sending more requests.",
      status: 429,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  return { apiKey };
}
