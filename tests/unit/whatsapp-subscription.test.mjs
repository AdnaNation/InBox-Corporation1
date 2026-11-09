import assert from "node:assert/strict";
import { test } from "node:test";
import { isMetaAppSubscribed } from "../../src/lib/whatsapp-subscription.mjs";

test("matches Wavo app ID in the documented WhatsApp API response", () => {
  assert.equal(isMetaAppSubscribed({
    data: [{ whatsapp_business_api_data: { id: "123456", name: "Wavo" } }],
  }, "123456"), true);
});

test("supports the legacy top-level app ID response", () => {
  assert.equal(isMetaAppSubscribed({ data: [{ id: "123456" }] }, "123456"), true);
});

test("does not accept a different app or an empty subscription list", () => {
  assert.equal(isMetaAppSubscribed({ data: [{ whatsapp_business_api_data: { id: "999" } }] }, "123456"), false);
  assert.equal(isMetaAppSubscribed({ data: [] }, "123456"), false);
});

test("fails closed for malformed responses or missing app IDs", () => {
  assert.equal(isMetaAppSubscribed(null, "123456"), false);
  assert.equal(isMetaAppSubscribed({ data: "not-an-array" }, "123456"), false);
  assert.equal(isMetaAppSubscribed({ data: [{ id: "123456" }] }, ""), false);
});
