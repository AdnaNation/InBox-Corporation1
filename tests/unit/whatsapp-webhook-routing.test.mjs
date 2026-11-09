import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesWhatsAppWebhookAccount } from "../../src/lib/whatsapp-webhook-routing.mjs";

test("routes a webhook only when both stored WABA and phone number match", () => {
  const account = { wabaId: "waba-1", phoneNumberId: "phone-1" };
  assert.equal(matchesWhatsAppWebhookAccount(account, "waba-1", "phone-1"), true);
  assert.equal(matchesWhatsAppWebhookAccount(account, "waba-2", "phone-1"), false);
  assert.equal(matchesWhatsAppWebhookAccount(account, "waba-1", "phone-2"), false);
});

test("rejects missing WABA identity for a record that stores one", () => {
  assert.equal(matchesWhatsAppWebhookAccount(
    { wabaId: "waba-1", phoneNumberId: "phone-1" },
    undefined,
    "phone-1",
  ), false);
});

test("preserves routing for legacy records without a stored WABA ID", () => {
  assert.equal(matchesWhatsAppWebhookAccount(
    { phoneNumberId: "phone-1" },
    "waba-1",
    "phone-1",
  ), true);
});

test("fails closed when account or phone number is missing", () => {
  assert.equal(matchesWhatsAppWebhookAccount(null, "waba-1", "phone-1"), false);
  assert.equal(matchesWhatsAppWebhookAccount({ wabaId: "waba-1" }, "waba-1", "phone-1"), false);
});
