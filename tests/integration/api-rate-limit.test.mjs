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
