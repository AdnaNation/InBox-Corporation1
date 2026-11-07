import test from "node:test";
import assert from "node:assert/strict";
import { isValidWebhookTarget, signWebhookPayload, verifyWebhookSignature, WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_CATALOG } from "../../src/lib/public-webhooks.mjs";
import { decodeWebhookDeliveryCursor, encodeWebhookDeliveryCursor } from "../../src/lib/webhook-delivery-pagination.mjs";

test("webhook target validation requires a public HTTPS hostname shape", () => {
  assert.equal(isValidWebhookTarget("https://example.com/hooks/wavo"), true);
  assert.equal(isValidWebhookTarget("http://example.com/hooks"), false);
  assert.equal(isValidWebhookTarget("https://localhost/hook"), false);
  assert.equal(isValidWebhookTarget("https://127.0.0.1/hook"), false);
  assert.equal(isValidWebhookTarget("https://user:pass@example.com/hook"), false);
  assert.equal(isValidWebhookTarget("https://example.com:8443/hook"), false);
});

test("webhook signatures bind the timestamp and exact raw body", () => {
  const secret = "test-webhook-secret";
  const body = JSON.stringify({ id: "evt_1", type: "message.received" });
  const timestamp = 1794000000;
  const signature = signWebhookPayload(secret, body, timestamp);
  assert.equal(verifyWebhookSignature(secret, body, timestamp, signature), true);
  assert.equal(verifyWebhookSignature(secret, body + " ", timestamp, signature), false);
  assert.equal(verifyWebhookSignature(secret, body, timestamp + 1, signature), false);
});

test("only documented event types are supported", () => {
  assert.deepEqual(WEBHOOK_EVENT_TYPES, [
    "message.received", "message.status_updated",
    "campaign.created", "campaign.queued", "campaign.paused",
    "campaign.resumed", "campaign.cancelled", "campaign.completed",
  ]);
});


test("webhook event catalog documents real events and the test-only event", () => {
  assert.deepEqual(WEBHOOK_EVENT_CATALOG.map((item) => item.type), [
    ...WEBHOOK_EVENT_TYPES, "webhook.test",
  ]);
  assert.equal(WEBHOOK_EVENT_CATALOG.every((item) => item.description.length > 0), true);
  assert.equal(WEBHOOK_EVENT_CATALOG.find((item) => item.type === "webhook.test").testable, true);
  assert.equal(WEBHOOK_EVENT_TYPES.includes("webhook.test"), false);
});


test("webhook delivery history cursors preserve timestamp and ID ordering", () => {
  const delivery = {
    _id: { toString: () => "66a000000000000000000001" },
    createdAt: new Date("2026-11-07T06:00:00.000Z"),
  };
  const encoded = encodeWebhookDeliveryCursor(delivery);
  const decoded = decodeWebhookDeliveryCursor(encoded);
  assert.equal(decoded.id, "66a000000000000000000001");
  assert.equal(decoded.createdAt.toISOString(), "2026-11-07T06:00:00.000Z");
  assert.equal(decodeWebhookDeliveryCursor("not-a-cursor"), null);
  assert.equal(decodeWebhookDeliveryCursor(Buffer.from(JSON.stringify({
    id: "not-an-object-id", createdAt: "2026-11-07T06:00:00.000Z",
  })).toString("base64url")), null);
});


test("webhook delivery history filter keeps workspace and subscription boundaries across cursor pages", async () => {
  const { buildWebhookDeliveryHistoryFilter } = await import("../../src/lib/webhook-delivery-pagination.mjs");
  const subscriptionId = "66a000000000000000000001";
  const workspaceId = "66a000000000000000000002";
  const cursor = { id: "66a000000000000000000003", createdAt: new Date("2026-11-07T06:00:00.000Z") };
  const filter = buildWebhookDeliveryHistoryFilter(new (await import("mongodb")).ObjectId(subscriptionId), new (await import("mongodb")).ObjectId(workspaceId), cursor);
  assert.equal(filter.subscriptionId.toString(), subscriptionId);
  assert.equal(filter.workspaceId.toString(), workspaceId);
  assert.equal(filter.$or[0].createdAt.$lt.toISOString(), cursor.createdAt.toISOString());
  assert.equal(filter.$or[1].createdAt.getTime(), cursor.createdAt.getTime());
  assert.equal(filter.$or[1]._id.$lt.toString(), cursor.id);
});


test("webhook history index is cached per database connection", async () => {
  const { ensureWebhookDeliveryHistoryIndex } = await import("../../src/lib/webhook-delivery-pagination.mjs");
  function createDb() {
    let calls = 0;
    return {
      getIndexCalls: () => calls,
      collection(name) {
        assert.equal(name, "webhookDeliveries");
        return {
          async createIndex(keys, options) {
            calls += 1;
            assert.deepEqual(keys, { workspaceId: 1, subscriptionId: 1, createdAt: -1, _id: -1 });
            assert.equal(options.name, "public_api_webhook_delivery_history");
            return options.name;
          },
        };
      },
    };
  }
  const firstDb = createDb();
  const secondDb = createDb();
  await Promise.all([
    ensureWebhookDeliveryHistoryIndex(firstDb),
    ensureWebhookDeliveryHistoryIndex(firstDb),
    ensureWebhookDeliveryHistoryIndex(secondDb),
  ]);
  assert.equal(firstDb.getIndexCalls(), 1);
  assert.equal(secondDb.getIndexCalls(), 1);
});

test("webhook history index setup retries after a failed attempt", async () => {
  const { ensureWebhookDeliveryHistoryIndex } = await import("../../src/lib/webhook-delivery-pagination.mjs");
  let attempts = 0;
  const db = {
    collection() {
      return {
        async createIndex() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary history index failure");
          return "public_api_webhook_delivery_history";
        },
      };
    },
  };
  await assert.rejects(ensureWebhookDeliveryHistoryIndex(db), /temporary history index failure/);
  assert.equal(await ensureWebhookDeliveryHistoryIndex(db), "public_api_webhook_delivery_history");
  assert.equal(attempts, 2);
});
