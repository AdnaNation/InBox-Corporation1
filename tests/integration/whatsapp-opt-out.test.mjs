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
    "",
  ];

  for (const body of phrases) {
    assert.equal(isWhatsAppOptOutMessage({ type: "text", text: { body } }), false, body);
  }

  assert.equal(isWhatsAppOptOutMessage({ type: "image", image: { caption: "STOP" } }), false);
  assert.equal(isWhatsAppOptOutMessage(null), false);
});
