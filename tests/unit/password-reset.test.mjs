import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordResetToken, hashPasswordResetToken } from "../../src/lib/password-reset.mjs";

test("creates a random URL-safe password reset token with a one-hour expiry", () => {
  const now = new Date("2026-11-07T08:00:00.000Z");
  const first = createPasswordResetToken(now);
  const second = createPasswordResetToken(now);
  assert.match(first.token, /^[A-Za-z0-9_-]{40,64}$/);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.expiresAt.toISOString(), "2026-11-07T09:00:00.000Z");
});

test("rejects malformed password reset tokens before hashing", () => {
  for (const value of [null, "", "short", "token with spaces", "x".repeat(100)]) {
    assert.equal(hashPasswordResetToken(value), null);
  }
});
