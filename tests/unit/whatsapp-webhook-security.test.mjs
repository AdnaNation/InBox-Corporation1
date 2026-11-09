import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWhatsAppWebhookSignature } from "../../src/lib/whatsapp-webhook-security.mjs";

test("accepts a signature generated with the customer's Meta App Secret", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const secret = "customer-meta-app-secret";
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyWhatsAppWebhookSignature(body, signature, secret), true);
});

test("rejects a signature generated with a different Meta App Secret", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const signature = "sha256=" + createHmac("sha256", "other-app-secret").update(body).digest("hex");
  assert.equal(verifyWhatsAppWebhookSignature(body, signature, "customer-meta-app-secret"), false);
});

test("rejects missing or malformed signatures and missing secrets", () => {
  assert.equal(verifyWhatsAppWebhookSignature("{}", null, "secret"), false);
  assert.equal(verifyWhatsAppWebhookSignature("{}", "sha256=bad", "secret"), false);
  assert.equal(verifyWhatsAppWebhookSignature("{}", "sha256=" + "a".repeat(64), ""), false);
});
