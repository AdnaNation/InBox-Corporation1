import assert from "node:assert/strict";
import test from "node:test";
import { isAmbiguousMetaSendResponse } from "../../src/lib/campaign-delivery.mjs";

test("classifies gateway timeouts and provider server errors as ambiguous", () => {
  for (const status of [408, 500, 501, 502, 503, 504, 599]) {
    assert.equal(isAmbiguousMetaSendResponse(status), true, String(status));
  }
});

test("does not classify definite client responses or successful responses as ambiguous", () => {
  for (const status of [200, 201, 400, 401, 403, 404, 409, 429]) {
    assert.equal(isAmbiguousMetaSendResponse(status), false, String(status));
  }
});

test("rejects non-integer and out-of-range status values", () => {
  for (const status of [undefined, null, "500", 499, 600, 500.5]) {
    assert.equal(isAmbiguousMetaSendResponse(status), false);
  }
});
