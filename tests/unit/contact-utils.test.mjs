import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePhoneNumber, normalizePhoneNumbers } from "../../src/lib/contact-utils.js";

test("normalizes international phone numbers written with Bengali digits", () => {
  assert.equal(normalizePhoneNumber("০১৭১২৩৪৫৬৭৮"), "01712345678");
  assert.equal(normalizePhoneNumber("+৮৮০ ১৭১২-৩৪৫৬৭৮"), "8801712345678");
});

test("normalizes Arabic-Indic and Eastern Arabic-Indic digits", () => {
  assert.equal(normalizePhoneNumber("٠٠٩٦٦٥٠١٢٣٤٥٦٧"), "966501234567");
  assert.equal(normalizePhoneNumber("۰۹۱۲۳۴۵۶۷۸۹"), "09123456789");
});

test("keeps validation strict after numeral conversion", () => {
  assert.equal(normalizePhoneNumber("০১২৩"), null);
  assert.equal(normalizePhoneNumber("abc"), null);
  assert.deepEqual(normalizePhoneNumbers(["০১৭১২৩৪৫৬৭৮", "01712345678", "invalid"]), {
    valid: ["01712345678"],
    invalid: ["invalid"],
  });
});
