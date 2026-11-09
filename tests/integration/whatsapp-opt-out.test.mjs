import assert from "node:assert/strict";
import { test } from "node:test";
import { isWhatsAppOptOutMessage } from "../../src/lib/whatsapp-opt-out.mjs";

test("recognizes standard WhatsApp opt-out keywords and clear natural-language requests", () => {
  const phrases = [
    "STOP",
    "stop all",
    "Unsubscribe",
    "please stop sending messages",
    "stop messaging me",
    "don't message me again",
    "I do not want to receive any more messages",
    "I want to stop receiving messages",
    "opt out of all messages",
    "remove me from all messages",
    "no more messages",
    "cancel my subscription",
    "don’t message me again",
    "আনসাবস্ক্রাইব",
    "আনসাবস্ক্রাইব করুন",
    "অপ্ট আউট",
    "মেসেজ বন্ধ করুন",
    "আর মেসেজ নয়",
    "মেসেজ পাঠাবেন না",
    "মেসেজ দেবেন না",
    "মেসেজ দিবেন না",
    "মেসেজ দিয়েন না",
    "মেসেজ করবেন না",
    "আর মেসেজ পাঠাবেন না",
    "আর মেসেজ দেবেন না",
    "আমাকে আর মেসেজ দিবেন না",
    "আমাকে আর মেসেজ কইরেন না",
    "যোগাযোগ করবেন না",
    "আমাকে আর যোগাযোগ করবেন না",
    "বার্তা পাঠাবেন না।",
    "স্টপ",
    "bondho korun",
    "ar msg diben na",
    "msg pathaben na",
  ];

  for (const body of phrases) {
    assert.equal(isWhatsAppOptOutMessage({ type: "text", text: { body } }), true, body);
  }
});

test("does not treat unrelated text or non-text messages as opt-outs", () => {
  const phrases = [
    "please stop by the office",
    "I can't stop laughing",
    "I want to receive more messages",
    "Can you send me the stop sign image?",
    "মেসেজ না পাঠালে ভালো হয় না",
    "আমি মেসেজ বন্ধ করে দিয়েছি",
    "",
  ];

  for (const body of phrases) {
    assert.equal(isWhatsAppOptOutMessage({ type: "text", text: { body } }), false, body);
  }

  assert.equal(isWhatsAppOptOutMessage({ type: "image", image: { caption: "STOP" } }), false);
  assert.equal(isWhatsAppOptOutMessage(null), false);
});


test("recognizes opt-out requests from WhatsApp quick-reply and list buttons", () => {
  assert.equal(isWhatsAppOptOutMessage({
    type: "button",
    button: { text: "Stop", payload: "OPT_OUT" },
  }), true);
  assert.equal(isWhatsAppOptOutMessage({
    type: "interactive",
    interactive: { button_reply: { title: "More details", id: "unsubscribe" } },
  }), true);
  assert.equal(isWhatsAppOptOutMessage({
    type: "button",
    button: { text: "More details", payload: "OPT_OUT" },
  }), true);
  assert.equal(isWhatsAppOptOutMessage({
    type: "interactive",
    interactive: { button_reply: { title: "আনসাবস্ক্রাইব", id: "unsubscribe" } },
  }), true);
  assert.equal(isWhatsAppOptOutMessage({
    type: "interactive",
    interactive: { list_reply: { title: "মেসেজ বন্ধ করুন", id: "stop" } },
  }), true);
  assert.equal(isWhatsAppOptOutMessage({
    type: "interactive",
    interactive: { button_reply: { title: "View details", id: "details" } },
  }), false);
});
