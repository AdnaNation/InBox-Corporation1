import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run password reset integration tests.");

const client = new MongoClient(mongoUri);
let db;
const userIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && userIds.length) {
    await db.collection("passwordResetTokens_index_test").deleteMany({ userId: { $in: userIds } });
  }
  await client.close();
});

test("allows only one pending password reset token per user", async () => {
  const collection = db.collection("passwordResetTokens_index_test");
  await collection.createIndex(
    { userId: 1 },
    { unique: true, partialFilterExpression: { status: "pending" }, name: "test_one_pending_password_reset_per_user" },
  );

  const userId = new ObjectId();
  userIds.push(userId);
  const now = new Date();
  const token = (tokenHash, status = "pending") => ({
    userId,
    tokenHash,
    status,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
  });

  await collection.insertOne(token("reset-token-one"));
  await assert.rejects(
    collection.insertOne(token("reset-token-two")),
    (error) => error.code === 11000,
  );

  await collection.updateOne({ userId, status: "pending" }, { $set: { status: "used", usedAt: now } });
  await collection.insertOne(token("reset-token-three"));

  assert.equal(await collection.countDocuments({ userId, status: "pending" }), 1);
  assert.equal(await collection.countDocuments({ userId, status: "used" }), 1);
});
