import test from "node:test";
import assert from "node:assert/strict";
import {
  BANGLADESH_WHATSAPP_RATES_USD,
  estimateBangladeshWhatsAppCost,
  getBangladeshWhatsAppRate,
} from "../../src/lib/whatsapp-pricing.mjs";

test("returns Bangladesh category rates", () => {
  assert.equal(getBangladeshWhatsAppRate("marketing"), 0.0732);
  assert.equal(getBangladeshWhatsAppRate("UTILITY"), 0.0037);
  assert.equal(getBangladeshWhatsAppRate("authentication"), 0.0037);
  assert.equal(getBangladeshWhatsAppRate("unknown"), null);
});

test("estimates cost from delivered message count", () => {
  assert.equal(estimateBangladeshWhatsAppCost("MARKETING", 1000), 73.2);
  assert.equal(estimateBangladeshWhatsAppCost("UTILITY", 1000), 3.7);
  assert.equal(estimateBangladeshWhatsAppCost("AUTHENTICATION", 0), 0);
});

test("rejects invalid message counts", () => {
  assert.equal(estimateBangladeshWhatsAppCost("MARKETING", -1), null);
  assert.equal(estimateBangladeshWhatsAppCost("MARKETING", 1.5), null);
  assert.equal(estimateBangladeshWhatsAppCost("MARKETING", "many"), null);
});

test("rate card contains service reply reference rate", () => {
  assert.equal(BANGLADESH_WHATSAPP_RATES_USD.SERVICE, 0.0037);
});
