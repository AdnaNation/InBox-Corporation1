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


test("sends a password reset link through the configured Resend account", async (t) => {
  const { sendPasswordResetEmail } = await import("../../src/lib/email.mjs");
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "Wavo <no-reply@example.com>";
  t.after(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  });

  let captured;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response("", { status: 200 });
  });

  await sendPasswordResetEmail({
    to: "person@example.com",
    token: "B".repeat(43),
    origin: "https://wavo.example.com",
  });

  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, "Bearer re_test_key");
  assert.equal(captured.body.subject, "Reset your Wavo password");
  assert.deepEqual(captured.body.to, ["person@example.com"]);
  assert.match(captured.body.text, /https:\/\/wavo\.example\.com\/reset-password\?token=/);
});

test("fails safely when password reset email delivery is not configured", async (t) => {
  const { sendPasswordResetEmail } = await import("../../src/lib/email.mjs");
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  t.after(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  });
  await assert.rejects(
    sendPasswordResetEmail({ to: "person@example.com", token: "B".repeat(43), origin: "https://wavo.example.com" }),
    /Email delivery is not configured/,
  );
});


test("sends a password reset link through the configured Resend account", async (t) => {
  const { sendPasswordResetEmail } = await import("../../src/lib/email.mjs");
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.EMAIL_FROM = "Wavo <no-reply@example.com>";
  t.after(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  });

  let captured;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) };
    return new Response("", { status: 200 });
  });

  await sendPasswordResetEmail({
    to: "person@example.com",
    token: "B".repeat(43),
    origin: "https://wavo.example.com",
  });

  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.Authorization, "Bearer re_test_key");
  assert.equal(captured.body.subject, "Reset your Wavo password");
  assert.deepEqual(captured.body.to, ["person@example.com"]);
  assert.match(captured.body.text, /https:\/\/wavo\.example\.com\/reset-password\?token=/);
});

test("fails safely when password reset email delivery is not configured", async (t) => {
  const { sendPasswordResetEmail } = await import("../../src/lib/email.mjs");
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  t.after(() => {
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousFrom;
  });
  await assert.rejects(
    sendPasswordResetEmail({ to: "person@example.com", token: "B".repeat(43), origin: "https://wavo.example.com" }),
    /Email delivery is not configured/,
  );
});
