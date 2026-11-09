import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhoneNumber, normalizePhoneNumbers } from "../../src/lib/contact-utils.js";

test("normalizes international phone numbers written with Bengali digits", () => {
  assert.equal(normalizePhoneNumber("+৮৮০ ১৭১২-৩৪৫৬৭৮"), "8801712345678");
  assert.equal(normalizePhoneNumber("০১৭১২৩৪৫৬৭৮"), null, "local numbers still require an international country code");
});

test("normalizes Arabic-Indic and Eastern Arabic-Indic digits", () => {
  assert.equal(normalizePhoneNumber("+٩٦٦٥٠١٢٣٤٥٦٧"), "966501234567");
  assert.equal(normalizePhoneNumber("+۹۸۹۱۲۳۴۵۶۷۸۹"), "989123456789");
});

test("keeps validation strict after numeral conversion", () => {
  assert.equal(normalizePhoneNumber("০১২৩"), null);
  assert.equal(normalizePhoneNumber("abc"), null);
  assert.deepEqual(normalizePhoneNumbers(["+৮৮০১৭১২৩৪৫৬৭৮", "8801712345678", "invalid"]), {
    valid: ["8801712345678"],
    invalid: ["invalid"],
  });
});
