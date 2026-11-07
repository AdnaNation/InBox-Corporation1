import test from "node:test";
import assert from "node:assert/strict";
import { isValidWebhookTarget, signWebhookPayload, verifyWebhookSignature, WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_CATALOG } from "../../src/lib/public-webhooks.mjs";

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
