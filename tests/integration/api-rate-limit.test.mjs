import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { API_RATE_LIMIT, consumeApiRateLimit } from "../../src/lib/api-rate-limit.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI is required to run public API integration tests.");
}

const client = new MongoClient(mongoUri);
let db;
const testApiKeyIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && testApiKeyIds.length) {
    await db.collection("apiRateLimits").deleteMany({
      _id: { $regex: `^(?:${testApiKeyIds.join("|")}):` },
    });
  }
  await client.close();
});

test("rate limit atomically allows 120 concurrent requests and rejects the rest", async () => {
  const apiKeyId = new ObjectId();
  testApiKeyIds.push(apiKeyId.toString());

  const results = await Promise.all(
    Array.from({ length: API_RATE_LIMIT + 5 }, () => consumeApiRateLimit(db, apiKeyId)),
  );

  assert.equal(results.filter((result) => result.allowed).length, API_RATE_LIMIT);
  assert.equal(results.filter((result) => !result.allowed).length, 5);
  assert.ok(results.every((result) => result.limit === API_RATE_LIMIT));
  assert.ok(results.every((result) => result.retryAfterSeconds >= 1));

  const counter = await db.collection("apiRateLimits").findOne({
    _id: { $regex: `^${apiKeyId.toString()}:` },
  });
  assert.equal(counter.count, API_RATE_LIMIT + 5);
});

test("rate limits are isolated between API keys", async () => {
  const firstKeyId = new ObjectId();
  const secondKeyId = new ObjectId();
  testApiKeyIds.push(firstKeyId.toString(), secondKeyId.toString());

  const [first, second] = await Promise.all([
    consumeApiRateLimit(db, firstKeyId),
    consumeApiRateLimit(db, secondKeyId),
  ]);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(first.remaining, API_RATE_LIMIT - 1);
  assert.equal(second.remaining, API_RATE_LIMIT - 1);
});


test("creates the rate-limit TTL index once per database connection", async () => {
  const { ensureApiRateLimitIndex } = await import("../../src/lib/api-rate-limit.mjs");
  const counts = new Map();
  const createDb = () => ({
    collection(name) {
      assert.equal(name, "apiRateLimits");
      return {
        async createIndex(keys, options) {
          assert.deepEqual(keys, { expiresAt: 1 });
          assert.equal(options.expireAfterSeconds, 0);
          assert.equal(options.name, "api_rate_limits_ttl");
          counts.set(this, (counts.get(this) || 0) + 1);
          return options.name;
        },
      };
    },
  });
  const firstDb = createDb();
  const secondDb = createDb();
  await Promise.all([
    ensureApiRateLimitIndex(firstDb),
    ensureApiRateLimitIndex(firstDb),
    ensureApiRateLimitIndex(secondDb),
  ]);
  assert.equal(counts.get(firstDb.collection("apiRateLimits")), undefined);
});

test("retries rate-limit index creation after a failed attempt", async () => {
  const { ensureApiRateLimitIndex } = await import("../../src/lib/api-rate-limit.mjs");
  let attempts = 0;
  const mockDb = {
    collection() {
      return {
        async createIndex() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary index failure");
          return "api_rate_limits_ttl";
        },
      };
    },
  };
  await assert.rejects(ensureApiRateLimitIndex(mockDb), /temporary index failure/);
  assert.equal(await ensureApiRateLimitIndex(mockDb), "api_rate_limits_ttl");
  assert.equal(attempts, 2);
});
