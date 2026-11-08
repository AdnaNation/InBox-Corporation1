import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  getPaddleCheckoutConfiguration,
  getPaddleEventId,
  getPaddleEventType,
  getPaddleItemPriceId,
  getPaddleSignatureParts,
  resolvePaddlePrice,
  verifyPaddleSignature,
} from "../../src/lib/paddle-billing.mjs";

const ids = {
  starterMonthly: "pri_00000000000000000000000001",
  starterYearly: "pri_00000000000000000000000002",
  growthMonthly: "pri_00000000000000000000000003",
  growthYearly: "pri_00000000000000000000000004",
  businessMonthly: "pri_00000000000000000000000005",
  businessYearly: "pri_00000000000000000000000006",
};

const env = {
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_client_token",
  PADDLE_WEBHOOK_SECRET: "webhook_secret",
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_PRICE_STARTER_MONTHLY: ids.starterMonthly,
  PADDLE_PRICE_STARTER_YEARLY: ids.starterYearly,
  PADDLE_PRICE_GROWTH_MONTHLY: ids.growthMonthly,
  PADDLE_PRICE_GROWTH_YEARLY: ids.growthYearly,
  PADDLE_PRICE_BUSINESS_MONTHLY: ids.businessMonthly,
  PADDLE_PRICE_BUSINESS_YEARLY: ids.businessYearly,
};

test("Paddle checkout is enabled only when token, webhook secret and all six prices exist", () => {
  assert.equal(getPaddleCheckoutConfiguration(env).enabled, true);
  assert.equal(getPaddleCheckoutConfiguration({ ...env, PADDLE_ENVIRONMENT: "" }).environment, "sandbox");
  assert.equal(getPaddleCheckoutConfiguration(env).environment, "sandbox");
  assert.equal(getPaddleCheckoutConfiguration(env).portalEnabled, false);
  assert.equal(getPaddleCheckoutConfiguration({ ...env, PADDLE_API_KEY: "server_api_key" }).portalEnabled, true);
  assert.equal(getPaddleCheckoutConfiguration({ ...env, PADDLE_WEBHOOK_SECRET: "" }).enabled, false);
  assert.equal(getPaddleCheckoutConfiguration({ ...env, PADDLE_PRICE_GROWTH_YEARLY: "" }).enabled, false);
  assert.equal(getPaddleCheckoutConfiguration({ ...env, PADDLE_PRICE_STARTER_MONTHLY: "bad" }).enabled, false);
});

test("resolves a configured Paddle price to the expected plan and billing cycle", () => {
  assert.deepEqual(resolvePaddlePrice(ids.growthYearly, env), { plan: "growth", billingCycle: "yearly" });
  assert.equal(resolvePaddlePrice("pri_unknown", env), null);
});

test("reads Paddle price identifiers from transaction item shapes", () => {
  assert.equal(getPaddleItemPriceId({ price: { id: ids.starterMonthly } }), ids.starterMonthly);
  assert.equal(getPaddleItemPriceId({ price_id: ids.growthMonthly }), ids.growthMonthly);
  assert.equal(getPaddleItemPriceId({}), null);
});

test("verifies Paddle HMAC signatures and rejects invalid or stale requests", () => {
  const body = JSON.stringify({ event_type: "transaction.completed" });
  const secret = "webhook_secret";
  const timestamp = 1794139200;
  const digest = createHmac("sha256", secret).update(timestamp + ":" + body).digest("hex");
  const header = "ts=" + timestamp + ";h1=" + digest;
  const nowMs = timestamp * 1000;

  assert.equal(verifyPaddleSignature(body, header, secret, nowMs), true);
  assert.equal(verifyPaddleSignature(body, "ts=" + timestamp + ";h1=" + "0".repeat(64), secret, nowMs), false);
  assert.equal(verifyPaddleSignature(body, header, "wrong_secret", nowMs), false);
  assert.equal(verifyPaddleSignature(body, header, secret, nowMs + 6000), false);
  assert.equal(verifyPaddleSignature(body, "invalid", secret, nowMs), false);
});

test("parses multiple Paddle signature digests and event identifiers", () => {
  assert.deepEqual(getPaddleSignatureParts("ts=123;h1=abc;h1=def"), { ts: "123", h1: ["abc", "def"] });
  assert.equal(getPaddleEventId({ notification_id: "ntf_123" }), "ntf_123");
  assert.equal(getPaddleEventType({ event_type: "subscription.updated" }), "subscription.updated");
});
