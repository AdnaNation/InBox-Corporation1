import assert from "node:assert/strict";
import test from "node:test";
import { parseBackgroundWorkerConfig, summarizeWorkerResponse } from "../../src/lib/background-worker-core.mjs";

const validEnv = {
  WAVO_APP_URL: "https://wavo.example.com/",
  CRON_SECRET: "a".repeat(48),
};

test("worker configuration normalizes the app origin and applies safe defaults", () => {
  assert.deepEqual(parseBackgroundWorkerConfig(validEnv), {
    appUrl: "https://wavo.example.com",
    cronSecret: validEnv.CRON_SECRET,
    intervalMs: 5000,
    requestTimeoutMs: 45000,
  });
});

test("worker configuration rejects non-HTTPS, credentialed, and non-origin URLs", () => {
  for (const WAVO_APP_URL of [
    "http://wavo.example.com",
    "https://user:pass@wavo.example.com",
    "https://wavo.example.com/api",
    "https://wavo.example.com?debug=1",
    "not-a-url",
  ]) {
    assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, WAVO_APP_URL }));
  }
});

test("worker configuration validates the shared secret and polling bounds", () => {
  assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, CRON_SECRET: "short" }), /CRON_SECRET/);
  assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, WORKER_INTERVAL_MS: "1000" }), /WORKER_INTERVAL_MS/);
  assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, WORKER_INTERVAL_MS: "60001" }), /WORKER_INTERVAL_MS/);
  assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, WORKER_REQUEST_TIMEOUT_MS: "2000" }), /WORKER_REQUEST_TIMEOUT_MS/);
  assert.throws(() => parseBackgroundWorkerConfig({ ...validEnv, WORKER_REQUEST_TIMEOUT_MS: "120001" }), /WORKER_REQUEST_TIMEOUT_MS/);
});

test("worker response summaries accept successful and explicitly handled busy/limit responses", () => {
  assert.deepEqual(summarizeWorkerResponse("campaign", 200, { success: true, processed: 1 }), {
    name: "campaign", httpStatus: 200, success: true, processed: 1, delivered: 0, retried: 0, failed: 0,
  });
  assert.equal(summarizeWorkerResponse("campaign", 202, { success: true, processed: 0 }).success, true);
  assert.equal(summarizeWorkerResponse("campaign", 409, { success: false, message: "Account disconnected" }).success, false);
  assert.equal(summarizeWorkerResponse("campaign", 429, { success: false, code: "PLAN_LIMIT_REACHED" }).success, false);
});

test("worker exits on authentication failures and retries transient or malformed responses", () => {
  assert.throws(
    () => summarizeWorkerResponse("webhook", 401, { success: false }),
    (error) => error.fatal === true && /CRON_SECRET/.test(error.message),
  );
  assert.throws(() => summarizeWorkerResponse("webhook", 500, { success: false }), /HTTP 500/);
  assert.throws(() => summarizeWorkerResponse("webhook", 200, null), /invalid JSON response/);
  assert.throws(() => summarizeWorkerResponse("webhook", 409, { success: true }), /unexpected HTTP 409/);
});
