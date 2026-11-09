import assert from "node:assert/strict";
import test from "node:test";
import { validatePublicApiConsentRequest } from "../../src/lib/public-api-consent.mjs";

test("accepts a customer opt-out without requiring proof or an extra confirmation", () => {
  assert.deepEqual(
    validatePublicApiConsentRequest({ action: "opt_out", source: "customer_request" }),
    { action: "opt_out", source: "customer_request", evidence: "" },
  );
});

test("accepts opt-out evidence when supplied", () => {
  assert.deepEqual(
    validatePublicApiConsentRequest({ action: "opt_out", source: "external_system", evidence: "Unsubscribed in account settings." }),
    { action: "opt_out", source: "external_system", evidence: "Unsubscribed in account settings." },
  );
});

test("requires explicit fresh evidence and confirmation for opt-in", () => {
  assert.deepEqual(
    validatePublicApiConsentRequest({
      action: "opt_in",
      source: "website_form",
      evidence: "Checked the WhatsApp consent box on 2026-11-09.",
      confirmed: true,
    }),
    { action: "opt_in", source: "website_form", evidence: "Checked the WhatsApp consent box on 2026-11-09." },
  );
  assert.ok(validatePublicApiConsentRequest({ action: "opt_in", source: "website_form", evidence: "Fresh consent." }).error);
  assert.ok(validatePublicApiConsentRequest({ action: "opt_in", source: "website_form", evidence: "Fresh consent.", confirmed: true }).error);
});

test("rejects unsupported sources, malformed evidence, and unknown actions", () => {
  assert.ok(validatePublicApiConsentRequest({ action: "opt_out", source: "guess" }).error);
  assert.ok(validatePublicApiConsentRequest({ action: "opt_out", source: "other", evidence: 42 }).error);
  assert.ok(validatePublicApiConsentRequest({ action: "opt_in", source: "other", evidence: "x".repeat(501), confirmed: true }).error);
  assert.ok(validatePublicApiConsentRequest({ action: "delete", source: "other" }).error);
  assert.ok(validatePublicApiConsentRequest(null).error);
});
