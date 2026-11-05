import { createHmac } from "node:crypto";

const WINDOW_MS = 15 * 60 * 1000;
let indexesPromise;

async function ensureRateLimitIndexes(db) {
  if (!indexesPromise) {
    indexesPromise = db.collection("authRateLimits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_auth_rate_limits" })
      .catch((error) => {
        indexesPromise = null;
        throw error;
      });
  }
  return indexesPromise;
}

function makeBucketId(scope, identity, now) {
  const bucket = Math.floor(now.getTime() / WINDOW_MS);
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  const digest = createHmac("sha256", secret)
    .update(String(identity).trim().toLowerCase())
    .digest("hex");
  return {
    id: `${scope}:${bucket}:${digest}`,
    resetAt: new Date((bucket + 1) * WINDOW_MS),
    expiresAt: new Date((bucket + 2) * WINDOW_MS),
  };
}

async function incrementBucket(collection, id, expiresAt, now) {
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { createdAt: now, expiresAt },
    $set: { updatedAt: now },
  };

  try {
    const result = await collection.findOneAndUpdate(
      { _id: id },
      update,
      { upsert: true, returnDocument: "after" },
    );
    return result?.count || 0;
  } catch (error) {
    // Concurrent first requests can race to create the same bucket.
    if (error.code !== 11000) throw error;
    const result = await collection.findOneAndUpdate(
      { _id: id },
      update,
      { returnDocument: "after" },
    );
    return result?.count || 0;
  }
}

/**
 * Atomically increments short-lived, hashed authentication counters.
 * Identity values are never stored in clear text.
 */
export async function consumeAuthRateLimits(db, checks) {
  const now = new Date();
  await ensureRateLimitIndexes(db);

  const collection = db.collection("authRateLimits");
  const results = await Promise.all(checks.filter((check) => check?.identity).map(async (check) => {
    const { id, resetAt, expiresAt } = makeBucketId(check.scope, check.identity, now);
    const count = await incrementBucket(collection, id, expiresAt, now);
    return {
      allowed: count <= check.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
    };
  }));

  const blocked = results.filter((result) => !result.allowed);
  if (blocked.length) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
