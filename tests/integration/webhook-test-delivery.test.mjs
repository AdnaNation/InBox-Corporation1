import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { queueWebhookTestDelivery } from "../../src/lib/webhook-test-delivery.mjs";

function fakeDatabase({ subscription = true } = {}) {
  const inserted = [];
  const queries = [];
  const deliveryId = new ObjectId();
  const db = {
    collection(name) {
      if (name === "webhookSubscriptions") {
        return {
          async findOne(query, options) {
            queries.push({ query, options });
            return subscription ? { _id: query._id } : null;
          },
        };
      }
      if (name === "webhookDeliveries") {
        return {
          async insertOne(document) {
            inserted.push(document);
            return { insertedId: deliveryId };
          },
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
  return { db, inserted, queries, deliveryId };
}

test("queues a signed test event only for an active subscription in the requested workspace", async () => {
  const workspaceId = new ObjectId();
  const subscriptionId = new ObjectId();
  const now = new Date("2026-11-07T06:00:00.000Z");
  const eventId = "evt_test_deterministic";
  const fake = fakeDatabase();

  const result = await queueWebhookTestDelivery(fake.db, {
    workspaceId, subscriptionId, now, eventId,
  });

  assert.deepEqual(fake.queries[0].query, {
    _id: subscriptionId,
    workspaceId,
    status: "active",
    secretEncrypted: { $exists: true, $ne: "" },
  });
  assert.deepEqual(fake.queries[0].options, { projection: { _id: 1 } });
  assert.equal(result.deliveryId, fake.deliveryId.toString());
  assert.equal(result.eventId, eventId);
  assert.equal(result.status, "pending");
  assert.equal(fake.inserted.length, 1);

  const delivery = fake.inserted[0];
  assert.equal(delivery.workspaceId, workspaceId);
  assert.equal(delivery.subscriptionId, subscriptionId);
  assert.equal(delivery.eventId, eventId);
  assert.equal(delivery.status, "pending");
  assert.equal(delivery.attempts, 0);
  assert.equal(delivery.nextAttemptAt, now);
  assert.equal(delivery.event.type, "webhook.test");
  assert.equal(delivery.event.data.test, true);
  assert.equal(delivery.event.createdAt, now.toISOString());
});

test("does not queue a test event when the subscription is missing or inactive", async () => {
  const fake = fakeDatabase({ subscription: false });
  const result = await queueWebhookTestDelivery(fake.db, {
    workspaceId: new ObjectId(),
    subscriptionId: new ObjectId(),
    eventId: "evt_test_not_found",
  });

  assert.equal(result, null);
  assert.equal(fake.inserted.length, 0);
});
