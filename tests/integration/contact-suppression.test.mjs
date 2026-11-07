import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureContactSuppressionIndex, findActiveContactSuppression, getActiveSuppressedPhones } from "../../src/lib/contact-suppression.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run contact suppression integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && workspaceIds.length) {
    await db.collection("contactSuppressions").deleteMany({ workspaceId: { $in: workspaceIds } });
  }
  await client.close();
});

test("active and legacy suppressions block sends, while explicitly inactive records do not", async () => {
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const collection = db.collection("contactSuppressions");
  await collection.insertMany([
    { workspaceId, phone: "8801700000001", active: true, reason: "inbound_keyword" },
    { workspaceId, phone: "8801700000002", reason: "legacy_opt_out" },
    { workspaceId, phone: "8801700000003", active: false, reason: "reinstated" },
  ]);

  assert.ok(await findActiveContactSuppression(db, workspaceId, "8801700000001"));
  const indexes = await collection.listIndexes().toArray();
  assert.ok(indexes.some((index) => index.key?.workspaceId === 1 && index.key?.phone === 1 && index.unique === true));
  assert.ok(await findActiveContactSuppression(db, workspaceId, "8801700000002"));
  assert.equal(await findActiveContactSuppression(db, workspaceId, "8801700000003"), null);
  assert.equal(await findActiveContactSuppression(db, workspaceId, ""), null);
  assert.deepEqual(
    (await getActiveSuppressedPhones(db, workspaceId)).sort(),
    ["8801700000001", "8801700000002"],
  );
});

test("suppression lookups are isolated by workspace", async () => {
  const workspaceId = new ObjectId();
  const otherWorkspaceId = new ObjectId();
  workspaceIds.push(workspaceId, otherWorkspaceId);
  await db.collection("contactSuppressions").insertOne({
    workspaceId,
    phone: "8801700000004",
    active: true,
  });

  assert.equal(await findActiveContactSuppression(db, otherWorkspaceId, "8801700000004"), null);
  assert.ok(await findActiveContactSuppression(db, workspaceId, "8801700000004"));
  assert.deepEqual(await getActiveSuppressedPhones(db, otherWorkspaceId), []);
  assert.deepEqual(await getActiveSuppressedPhones(db, workspaceId), ["8801700000004"]);
});

test("creates the suppression collection and lookup index on first use", async () => {
  const isolatedClient = new MongoClient(mongoUri);
  await isolatedClient.connect();
  const isolatedDb = isolatedClient.db("wavo_suppression_index_" + new ObjectId().toString());
  try {
    await ensureContactSuppressionIndex(isolatedDb);
    const indexes = await isolatedDb.collection("contactSuppressions").listIndexes().toArray();
    assert.ok(indexes.some((index) => index.key?.workspaceId === 1 && index.key?.phone === 1));
  } finally {
    await isolatedDb.dropDatabase();
    await isolatedClient.close();
  }
});
