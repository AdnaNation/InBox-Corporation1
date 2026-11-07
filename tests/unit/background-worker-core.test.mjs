import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBackgroundWorkerConfig,
  summarizeWorkerResponse,
} from "../../src/lib/background-worker-core.mjs";

const validEnv = {
  WAVO_APP_URL: "https://wavo.example.com/",
  CRON_SECRET: "x".repeat(48),
};

test("normalizes a valid app origin and applies safe polling defaults", () => {
  assert.deepEqual(parseBackgroundWorkerConfig(validEnv), {
    appUrl: "https://wavo.example.com",
    cronSecret: validEnv.CRON_SECRET,
    intervalMs: 5000,
    requestTimeoutMs: 45000,
  });
});

test("rejects insecure or non-origin app URLs", () => {
  for (const WAVO_APP_URL of [
    "http://wavo.example.com",
    "https://user:pass@wavo.example.com",
    "https://wavo.example.com/nested",
    "https://wavo.example.com?debug=1",
  ]) {
    assert.throws(
      () => parseBackgroundWorkerConfig({ ...validEnv, WAVO_APP_URL }),
      /WAVO_APP_URL must be an HTTPS app origin/,
    );
  }
});

test("rejects missing and weak cron secrets", () => {
  assert.throws(() => parseBackgroundWorkerConfig({ WAVO_APP_URL: validEnv.WAVO_APP_URL }), /CRON_SECRET/);
  assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, CRON_SECRET: "short" }), /CRON_SECRET/);
});

test("enforces polling and request timeout bounds", () => {
  for (const WORKER_INTERVAL_MS of ["1999", "60001", "2.5"]) {
    assert.throws(
      () => parseBackgroundWorkerConfig({ ...validEnv, WORKER_INTERVAL_MS }),
      /WORKER_INTERVAL_MS/,
    );
  }
  for (const WORKER_REQUEST_TIMEOUT_MS of ["4999", "120001", "invalid"]) {
    assert.throws(
      () => parseBackgroundWorkerConfig({ ...validEnv, WORKER_REQUEST_TIMEOUT_MS }),
      /WORKER_REQUEST_TIMEOUT_MS/,
    );
  }
});

test("summarizes successful worker counts without returning response payloads", () => {
  assert.deepEqual(
    summarizeWorkerResponse("campaign", 200, {
      success: true, processed: 4, delivered: 3, retried: 1, failed: 0, privateData: "never log",
    }),
    { name: "campaign", httpStatus: 200, success: true, processed: 4, delivered: 3, retried: 1, failed: 0 },
  );
});

test("accepts documented busy and rate-limited responses only when unsuccessful", () => {
  assert.equal(summarizeWorkerResponse("webhook", 409, { success: false }).httpStatus, 409);
  assert.equal(summarizeWorkerResponse("webhook", 429, { success: false }).httpStatus, 429);
  assert.throws(() => summarizeWorkerResponse("webhook", 409, { success: true }), /unexpected HTTP 409/);
  assert.throws(() => summarizeWorkerResponse("webhook", 429, { success: true }), /unexpected HTTP 429/);
});

test("treats cron authentication failures as fatal", () => {
  for (const status of [401, 403]) {
    assert.throws(
      () => summarizeWorkerResponse("campaign", status, { success: false }),
      (error) => error.fatal === true && /rejected CRON_SECRET/.test(error.message),
    );
  }
});

test("rejects server errors and malformed worker responses", () => {
  assert.throws(() => summarizeWorkerResponse("campaign", 500, { success: false }), /HTTP 500/);
  assert.throws(() => summarizeWorkerResponse("campaign", 200, null), /invalid JSON response/);
  assert.throws(() => summarizeWorkerResponse("campaign", 200, []), /invalid JSON response/);
});
