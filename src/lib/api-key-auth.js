import { createHash } from "node:crypto";
import { getDatabase } from "@/lib/db";

const API_RATE_LIMIT = 120;
const API_RATE_WINDOW_MS = 60_000;
let rateLimitIndexPromise;

async function consumeApiRateLimit(db, apiKeyId) {
  if (!rateLimitIndexPromise) {
    rateLimitIndexPromise = db.collection("apiRateLimits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "api_rate_limits_ttl" })
      .catch((error) => {
        rateLimitIndexPromise = null;
        throw error;
      });
  }
  await rateLimitIndexPromise;

  const now = Date.now();
  const windowStart = Math.floor(now / API_RATE_WINDOW_MS) * API_RATE_WINDOW_MS;
  const id = `${apiKeyId.toString()}:${windowStart}`;
  const collection = db.collection("apiRateLimits");
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date(windowStart + API_RATE_WINDOW_MS * 2) },
  };
  let result;

  try {
    result = await collection.findOneAndUpdate(
      { _id: id },
      update,
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    result = await collection.findOneAndUpdate(
      { _id: id },
      { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
  }

  const record = result?.value ?? result;
  return {
    allowed: record.count <= API_RATE_LIMIT,
    limit: API_RATE_LIMIT,
    remaining: Math.max(0, API_RATE_LIMIT - record.count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + API_RATE_WINDOW_MS - now) / 1000)),
  };
}

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
