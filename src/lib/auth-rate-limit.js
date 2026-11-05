import { createHash } from "node:crypto";

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
  const digest = createHash("sha256")
    .update(String(identity).trim().toLowerCase())
    .digest("hex");
  return {
    id: `${scope}:${bucket}:${digest}`,
    expiresAt: new Date((bucket + 2) * WINDOW_MS),
  };
}

async function incrementBucket(collection, id, expiresAt, now) {
  try {
    await collection.updateOne(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { createdAt: now, expiresAt },
        $set: { updatedAt: now },
      },
      { upsert: true },
    );
  } catch (error) {
    // Concurrent first requests can race to create the same bucket.
    if (error.code !== 11000) throw error;
    await collection.updateOne(
      { _id: id },
      { $inc: { count: 1 }, $set: { updatedAt: now } },
    );
  }

  const record = await collection.findOne(
    { _id: id },
    { projection: { count: 1 } },
  );
  return record?.count || 0;
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
    const { id, expiresAt } = makeBucketId(check.scope, check.identity, now);
    const count = await incrementBucket(collection, id, expiresAt, now);
    return {
      allowed: count <= check.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
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
