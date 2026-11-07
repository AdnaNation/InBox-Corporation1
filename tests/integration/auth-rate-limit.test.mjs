import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { consumeAuthRateLimits } from "../../src/lib/auth-rate-limit.js";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run auth rate-limit integration tests.");

const client = new MongoClient(mongoUri);
const databaseName = "wavo_auth_rate_limit_" + new ObjectId().toString();
let db;
const originalJwtSecret = process.env.JWT_SECRET;

before(async () => {
  process.env.JWT_SECRET = "integration-test-secret-" + "x".repeat(40);
  await client.connect();
  db = client.db(databaseName);
});

after(async () => {
  if (db) await db.dropDatabase();
  await client.close();
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test("atomically enforces a per-identity limit under concurrent requests", async () => {
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => consumeAuthRateLimits(db, [
      { scope: "login-email", identity: " Person@Example.com ", limit: 3 },
    ])),
  );

  assert.equal(attempts.filter((result) => result.allowed).length, 3);
  assert.equal(attempts.filter((result) => !result.allowed).length, 5);
  assert.ok(attempts.filter((result) => !result.allowed).every((result) => result.retryAfterSeconds > 0));

  const records = await db.collection("authRateLimits").find({}).toArray();
  assert.equal(records.length, 1);
  assert.equal(records[0].count, 8);
  assert.equal(String(records[0]._id).includes("person@example.com"), false);
  assert.ok(records[0].expiresAt instanceof Date);
});

test("keeps rate limit scopes and identities isolated", async () => {
  const results = await Promise.all([
    consumeAuthRateLimits(db, [{ scope: "login-email", identity: "first@example.com", limit: 1 }]),
    consumeAuthRateLimits(db, [{ scope: "login-email", identity: "second@example.com", limit: 1 }]),
    consumeAuthRateLimits(db, [{ scope: "register-email", identity: "first@example.com", limit: 1 }]),
  ]);

  assert.deepEqual(results.map((result) => result.allowed), [true, true, true]);
  assert.equal(await db.collection("authRateLimits").countDocuments({}), 4);
});

test("rejects operation when the server-side HMAC secret is missing or weak", async () => {
  const previous = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "too-short";
    await assert.rejects(
      consumeAuthRateLimits(db, [{ scope: "login-email", identity: "secret-check@example.com", limit: 1 }]),
      /JWT_SECRET must contain at least 32 characters/,
    );
  } finally {
    process.env.JWT_SECRET = previous;
  }
});
