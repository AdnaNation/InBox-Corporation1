import assert from "node:assert/strict";
import test from "node:test";
import { isSessionVersionValid } from "../../src/lib/session-version.mjs";

test("accepts legacy and current sessions when the account version matches", () => {
  assert.equal(isSessionVersionValid(undefined, undefined), true);
  assert.equal(isSessionVersionValid(0, 0), true);
  assert.equal(isSessionVersionValid(3, 3), true);
});

test("rejects sessions issued before a password reset increments the version", () => {
  assert.equal(isSessionVersionValid(0, 1), false);
  assert.equal(isSessionVersionValid(2, 3), false);
});

test("treats malformed session versions as the legacy zero version", () => {
  assert.equal(isSessionVersionValid("1", 1), false);
  assert.equal(isSessionVersionValid(undefined, 1), false);
});
