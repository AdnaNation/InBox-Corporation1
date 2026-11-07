import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureBillingRequestIndexes } from "../../src/lib/billing-requests.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run billing request integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && workspaceIds.length) {
    await db.collection("billingRequests").deleteMany({ workspaceId: { $in: workspaceIds } });
  }
  await client.close();
});

test("billing request index permits only one pending request per workspace under concurrency", async () => {
  await ensureBillingRequestIndexes(db);
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const now = new Date();
  const makeRequest = (requestedPlan) => ({
    workspaceId,
    requestedPlan,
    billingCycle: "monthly",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const results = await Promise.allSettled([
    db.collection("billingRequests").insertOne(makeRequest("starter")),
    db.collection("billingRequests").insertOne(makeRequest("growth")),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(rejected.reason.code, 11000);
  assert.equal(await db.collection("billingRequests").countDocuments({ workspaceId, status: "pending" }), 1);
});

test("a reviewed request no longer blocks a new pending request", async () => {
  await ensureBillingRequestIndexes(db);
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const collection = db.collection("billingRequests");

  await collection.insertOne({
    workspaceId,
    requestedPlan: "starter",
    billingCycle: "monthly",
    status: "pending",
    createdAt: new Date(),
  });
  await collection.updateOne({ workspaceId, status: "pending" }, { $set: { status: "approved" } });

  await collection.insertOne({
    workspaceId,
    requestedPlan: "growth",
    billingCycle: "yearly",
    status: "pending",
    createdAt: new Date(),
  });

  assert.equal(await collection.countDocuments({ workspaceId, status: "pending" }), 1);
  assert.equal(await collection.countDocuments({ workspaceId, status: "approved" }), 1);
});

test("billing request index cache is shared across database handles on one connection", async () => {
  let calls = 0;
  const connection = {};
  const fakeDb = {
    client: connection,
    collection(name) {
      assert.equal(name, "billingRequests");
      return { async createIndex(keys, options) { calls += 1; assert.deepEqual(keys, { workspaceId: 1 }); assert.equal(options.unique, true); return options.name; } };
    },
  };
  const otherHandle = {
    client: connection,
    collection: fakeDb.collection,
  };
  await Promise.all([ensureBillingRequestIndexes(fakeDb), ensureBillingRequestIndexes(otherHandle)]);
  assert.equal(calls, 1);
});

test("billing request index setup retries after a transient failure", async () => {
  let attempts = 0;
  const connection = {};
  const fakeDb = {
    client: connection,
    collection() {
      return {
        async createIndex() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary index failure");
          return "one_pending_billing_request_per_workspace";
        },
      };
    },
  };

  await assert.rejects(ensureBillingRequestIndexes(fakeDb), /temporary index failure/);
  assert.equal(
    await ensureBillingRequestIndexes(fakeDb),
    "one_pending_billing_request_per_workspace",
  );
  assert.equal(attempts, 2);
});

test("concurrent billing reviews allow only one admin decision to claim a pending request", async () => {
  await ensureBillingRequestIndexes(db);
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  const collection = db.collection("billingRequests");
  const requestId = new ObjectId();
  await collection.insertOne({
    _id: requestId,
    workspaceId,
    requestedPlan: "growth",
    billingCycle: "monthly",
    status: "pending",
    createdAt: new Date(),
  });

  const reviewedAt = new Date();
  const [approval, rejection] = await Promise.all([
    collection.findOneAndUpdate(
      { _id: requestId, status: "pending" },
      { $set: { status: "approved", reviewedAt, reviewedBy: new ObjectId() } },
      { returnDocument: "before" },
    ),
    collection.findOneAndUpdate(
      { _id: requestId, status: "pending" },
      { $set: { status: "rejected", reviewedAt, reviewedBy: new ObjectId() } },
      { returnDocument: "before" },
    ),
  ]);

  const claimed = [approval?.value || approval, rejection?.value || rejection].filter(Boolean);
  assert.equal(claimed.length, 1);
  const finalRequest = await collection.findOne({ _id: requestId });
  assert.ok(["approved", "rejected"].includes(finalRequest.status));
  assert.equal(finalRequest.reviewedAt.getTime(), reviewedAt.getTime());
});
