import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import {
  releaseWorkspaceCampaignUsage,
  reserveWorkspaceCampaignUsage,
  reserveWorkspaceMessageUsage,
} from "../../src/lib/plan-limits.js";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run plan limit integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && workspaceIds.length) {
    await Promise.all([
      db.collection("workspaces").deleteMany({ _id: { $in: workspaceIds } }),
      db.collection("campaigns").deleteMany({ workspaceId: { $in: workspaceIds } }),
      db.collection("planUsageCounters").deleteMany({ workspaceId: { $in: workspaceIds } }),
    ]);
  }
  await client.close();
});

async function createFreeWorkspace() {
  const workspaceId = new ObjectId();
  workspaceIds.push(workspaceId);
  await db.collection("workspaces").insertOne({
    _id: workspaceId,
    slug: `test-${workspaceId.toString()}`,
    status: "active",
    subscription: { plan: "free" },
  });
  return workspaceId;
}

test("concurrent campaign reservations never exceed the monthly plan limit", async () => {
  const workspaceId = await createFreeWorkspace();
  const now = new Date();
  await db.collection("campaigns").insertMany(
    Array.from({ length: 2 }, (_, index) => ({
      workspaceId,
      name: `Historical campaign ${index + 1}`,
      createdAt: now,
    })),
  );

  const reservations = await Promise.all(
    Array.from({ length: 10 }, () => reserveWorkspaceCampaignUsage(db, workspaceId, 1)),
  );
  assert.equal(reservations.filter((reservation) => reservation.allowed).length, 3);
  assert.equal(reservations.filter((reservation) => !reservation.allowed).length, 7);

  let counter = await db.collection("planUsageCounters").findOne({ workspaceId });
  assert.equal(counter.campaigns, 5);

  await releaseWorkspaceCampaignUsage(db, workspaceId, 1);
  counter = await db.collection("planUsageCounters").findOne({ workspaceId });
  assert.equal(counter.campaigns, 4);

  const replacement = await reserveWorkspaceCampaignUsage(db, workspaceId, 1);
  assert.equal(replacement.allowed, true);
  assert.equal(replacement.usage.campaigns, 5);
});

test("first message and campaign reservations can initialize one shared counter concurrently", async () => {
  const workspaceId = await createFreeWorkspace();

  const [messageReservations, campaignReservations] = await Promise.all([
    Promise.all(Array.from({ length: 10 }, () => reserveWorkspaceMessageUsage(db, workspaceId, 1))),
    Promise.all(Array.from({ length: 5 }, () => reserveWorkspaceCampaignUsage(db, workspaceId, 1))),
  ]);

  assert.equal(messageReservations.filter((reservation) => reservation.allowed).length, 10);
  assert.equal(campaignReservations.filter((reservation) => reservation.allowed).length, 5);

  const counter = await db.collection("planUsageCounters").findOne({ workspaceId });
  assert.equal(counter.messages, 10);
  assert.equal(counter.campaigns, 5);
});
