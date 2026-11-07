import assert from "node:assert/strict";
import test from "node:test";
import { createEmailVerificationToken, hashEmailVerificationToken } from "../../src/lib/email-verification.mjs";

test("creates a random URL-safe verification token with a 24-hour expiry", () => {
  const now = new Date("2026-11-07T08:00:00.000Z");
  const first = createEmailVerificationToken(now);
  const second = createEmailVerificationToken(now);
  assert.match(first.token, /^[A-Za-z0-9_-]{40,64}$/);
  assert.equal(first.tokenHash, hashEmailVerificationToken(first.token));
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.expiresAt.toISOString(), "2026-11-08T08:00:00.000Z");
});

test("rejects malformed verification tokens before hashing", () => {
  for (const value of [null, "", "short", "token with spaces", "x".repeat(100)]) {
    assert.equal(hashEmailVerificationToken(value), null);
  }
});
