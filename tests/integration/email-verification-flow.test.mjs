import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run email verification integration tests.");

const client = new MongoClient(mongoUri);
let db;
const tokenHashes = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && tokenHashes.length) {
    await db.collection("emailVerificationTokens").deleteMany({ tokenHash: { $in: tokenHashes } });
  }
  await client.close();
});

test("a verification token can be atomically claimed only once", async () => {
  const tokenHash = "a".repeat(64);
  tokenHashes.push(tokenHash);
  await db.collection("emailVerificationTokens").insertOne({
    userId: new ObjectId(),
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  });

  const claim = () => db.collection("emailVerificationTokens").findOneAndUpdate(
    { tokenHash, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: "before", includeResultMetadata: false },
  );
  const results = await Promise.all([claim(), claim()]);
  assert.equal(results.filter(Boolean).length, 1);
  const stored = await db.collection("emailVerificationTokens").findOne({ tokenHash });
  assert.ok(stored.usedAt instanceof Date);
});

test("an expired verification token cannot be claimed", async () => {
  const tokenHash = "b".repeat(64);
  tokenHashes.push(tokenHash);
  await db.collection("emailVerificationTokens").insertOne({
    userId: new ObjectId(),
    tokenHash,
    expiresAt: new Date(Date.now() - 60_000),
    createdAt: new Date(),
  });

  const result = await db.collection("emailVerificationTokens").findOneAndUpdate(
    { tokenHash, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: "before", includeResultMetadata: false },
  );
  assert.equal(result, null);
});
