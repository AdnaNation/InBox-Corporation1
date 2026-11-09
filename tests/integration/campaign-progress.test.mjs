import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { refreshCampaignProgress } from "../../src/lib/campaign-progress.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run campaign progress integration tests.");

const client = new MongoClient(mongoUri);
let db;
const campaignIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && campaignIds.length) {
    await Promise.all([
      db.collection("campaigns").deleteMany({ _id: { $in: campaignIds } }),
      db.collection("campaignRecipients").deleteMany({ campaignId: { $in: campaignIds } }),
    ]);
  }
  await client.close();
});

test("Meta delivery callbacks reconcile completed campaign status and preserve completion time", async () => {
  const workspaceId = new ObjectId();
  const campaignId = new ObjectId();
  campaignIds.push(campaignId);
  const completedAt = new Date("2026-11-01T10:00:00.000Z");

  await db.collection("campaigns").insertOne({
    _id: campaignId,
    workspaceId,
    status: "completed",
    recipientCount: 2,
    completedAt,
  });
  await db.collection("campaignRecipients").insertMany([
    { workspaceId, campaignId, contactId: new ObjectId(), status: "delivered" },
    { workspaceId, campaignId, contactId: new ObjectId(), status: "failed" },
  ]);

  const failedSummary = await refreshCampaignProgress(db, workspaceId, campaignId);
  const withIssues = await db.collection("campaigns").findOne({ _id: campaignId, workspaceId });

  assert.equal(failedSummary.status, "completed_with_issues");
  assert.equal(withIssues.status, "completed_with_issues");
  assert.equal(withIssues.progress.failed, 1);
  assert.equal(withIssues.progress.delivered, 1);
  assert.equal(withIssues.completedAt.getTime(), completedAt.getTime());

  await db.collection("campaignRecipients").updateOne(
    { campaignId, status: "failed" },
    { $set: { status: "read", statusRank: 4 } },
  );

  const deliveredSummary = await refreshCampaignProgress(db, workspaceId, campaignId);
  const completed = await db.collection("campaigns").findOne({ _id: campaignId, workspaceId });

  assert.equal(deliveredSummary.status, "completed");
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress.failed, 0);
  assert.equal(completed.progress.read, 1);
  assert.equal(completed.completedAt.getTime(), completedAt.getTime());
});
