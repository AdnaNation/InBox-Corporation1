import test from "node:test";
import assert from "node:assert/strict";
import { after, before } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { retryFailedWebhookDelivery } from "../../src/lib/webhook-retry.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run webhook retry integration tests.");

const client = new MongoClient(mongoUri);
let db;
const subscriptionIds = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && subscriptionIds.length) {
    await db.collection("webhookDeliveries").deleteMany({ subscriptionId: { $in: subscriptionIds } });
    await db.collection("webhookSubscriptions").deleteMany({ _id: { $in: subscriptionIds } });
  }
  await client.close();
});

async function createFixture({ status = "failed" } = {}) {
  const workspaceId = new ObjectId();
  const subscriptionId = new ObjectId();
  const deliveryId = new ObjectId();
  subscriptionIds.push(subscriptionId);
  await db.collection("webhookSubscriptions").insertOne({
    _id: subscriptionId,
    workspaceId,
    status: "active",
    secretEncrypted: "encrypted-test-secret",
    url: "https://example.com/webhook",
    createdAt: new Date(),
  });
  await db.collection("webhookDeliveries").insertOne({
    _id: deliveryId,
    subscriptionId,
    workspaceId,
    eventId: "evt_" + deliveryId.toString(),
    event: { id: "evt_" + deliveryId.toString(), type: "message.received" },
    status,
    attempts: 10,
    lastError: "Endpoint returned HTTP 500.",
    responseStatus: 500,
    failedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { workspaceId, subscriptionId, deliveryId };
}

test("requeues a terminal failed delivery and clears terminal attempt state", async () => {
  const fixture = await createFixture();
  const now = new Date();
  const result = await retryFailedWebhookDelivery(db, { ...fixture, now });

  assert.deepEqual(result, { retried: true });
  const delivery = await db.collection("webhookDeliveries").findOne({ _id: fixture.deliveryId });
  assert.equal(delivery.status, "pending");
  assert.equal(delivery.attempts, 0);
  assert.equal(delivery.nextAttemptAt.getTime(), now.getTime());
  assert.equal(delivery.manualRetryAt.getTime(), now.getTime());
  assert.equal(delivery.lastError, undefined);
  assert.equal(delivery.failedAt, undefined);
});

test("does not retry a delivery more than once or retry a non-failed status", async () => {
  const fixture = await createFixture();
  const first = await retryFailedWebhookDelivery(db, fixture);
  const second = await retryFailedWebhookDelivery(db, fixture);

  assert.equal(first.retried, true);
  assert.deepEqual(second, { retried: false, reason: "delivery_not_retryable" });
});

test("does not cross workspace boundaries or retry disabled subscriptions", async () => {
  const fixture = await createFixture();
  const wrongWorkspace = await retryFailedWebhookDelivery(db, {
    ...fixture,
    workspaceId: new ObjectId(),
  });
  assert.deepEqual(wrongWorkspace, { retried: false, reason: "subscription_not_found" });

  await db.collection("webhookSubscriptions").updateOne(
    { _id: fixture.subscriptionId },
    { $set: { status: "disabled" }, $unset: { secretEncrypted: "" } },
  );
  const disabled = await retryFailedWebhookDelivery(db, fixture);
  assert.deepEqual(disabled, { retried: false, reason: "subscription_not_found" });
});
