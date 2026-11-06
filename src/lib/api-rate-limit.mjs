export const API_RATE_LIMIT = 120;
export const API_RATE_WINDOW_MS = 60_000;

let rateLimitIndexPromise;

export async function consumeApiRateLimit(db, apiKeyId) {
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
