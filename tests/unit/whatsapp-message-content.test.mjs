import assert from "node:assert/strict";
import { test } from "node:test";
import { extractWhatsAppMessageContent } from "../../src/lib/whatsapp-message-content.mjs";

test("extracts ordinary text messages", () => {
  assert.deepEqual(
    extractWhatsAppMessageContent({ type: "text", text: { body: "Hello" } }),
    { type: "text", text: "Hello", media: null },
  );
});

test("extracts legacy button reply text and payload fallback", () => {
  assert.equal(
    extractWhatsAppMessageContent({ type: "button", button: { text: "Stop", payload: "OPT_OUT" } }).text,
    "Stop",
  );
  assert.equal(
    extractWhatsAppMessageContent({ type: "button", button: { payload: "OPT_OUT" } }).text,
    "OPT_OUT",
  );
});

test("extracts interactive button and list reply labels", () => {
  assert.equal(
    extractWhatsAppMessageContent({
      type: "interactive",
      interactive: { button_reply: { title: "Unsubscribe", id: "stop" } },
    }).text,
    "Unsubscribe",
  );
  assert.equal(
    extractWhatsAppMessageContent({
      type: "interactive",
      interactive: { list_reply: { title: "মেসেজ বন্ধ করুন", id: "stop" } },
    }).text,
    "মেসেজ বন্ধ করুন",
  );
});

test("preserves media and location extraction", () => {
  assert.deepEqual(
    extractWhatsAppMessageContent({ type: "image", image: { id: "media-1", mime_type: "image/jpeg", caption: "Photo" } }),
    { type: "image", text: "Photo", media: { id: "media-1", mimeType: "image/jpeg", filename: null } },
  );
  assert.equal(
    extractWhatsAppMessageContent({ type: "location", location: { latitude: 23.8, longitude: 90.4, name: "Dhaka" } }).text,
    "Dhaka",
  );
});
