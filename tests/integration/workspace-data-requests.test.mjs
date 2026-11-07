import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureWorkspaceDataRequestIndexes } from "../../src/lib/workspace-data-requests.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run workspace data request integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && workspaceIds.length) {
    await db.collection("workspaceDataRequests").deleteMany({ workspaceId: { $in: workspaceIds } });
    await db.collection("workspaceAuditLogs").deleteMany({ workspaceId: { $in: workspaceIds } });
  }
  await client.close();
});

test("allows only one active request of each type per workspace under concurrency", async () => {
  await ensureWorkspaceDataRequestIndexes(db);
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const collection = db.collection("workspaceDataRequests");
  const makeRequest = (type) => ({
    workspaceId,
    type,
    active: true,
    status: "pending",
    createdAt: new Date(),
  });

  const results = await Promise.allSettled([
    collection.insertOne(makeRequest("export")),
    collection.insertOne(makeRequest("export")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, 11000);

  await collection.insertOne(makeRequest("deletion"));
  assert.equal(await collection.countDocuments({ workspaceId, active: true }), 2);
});

test("a request remains unique while in review and permits a new request after closure", async () => {
  await ensureWorkspaceDataRequestIndexes(db);
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const collection = db.collection("workspaceDataRequests");
  const first = await collection.insertOne({
    workspaceId,
    type: "deletion",
    active: true,
    status: "pending",
    createdAt: new Date(),
  });

  await collection.updateOne({ _id: first.insertedId }, { $set: { status: "in_review" } });
  await assert.rejects(
    collection.insertOne({ workspaceId, type: "deletion", active: true, status: "pending", createdAt: new Date() }),
    (error) => error.code === 11000,
  );

  await collection.updateOne({ _id: first.insertedId }, { $set: { status: "completed", active: false } });
  await collection.insertOne({ workspaceId, type: "deletion", active: true, status: "pending", createdAt: new Date() });
  assert.equal(await collection.countDocuments({ workspaceId, type: "deletion", active: true }), 1);
  assert.equal(await collection.countDocuments({ workspaceId, type: "deletion", status: "completed" }), 1);
});
