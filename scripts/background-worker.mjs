import { setTimeout as sleep } from "node:timers/promises";

const appUrl = process.env.WAVO_APP_URL?.trim().replace(/\/$/, "");
const cronSecret = process.env.CRON_SECRET;
const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 5000);
const requestTimeoutMs = Number(process.env.WORKER_REQUEST_TIMEOUT_MS || 45000);

if (!appUrl || !/^https:\/\//i.test(appUrl)) {
  throw new Error("WAVO_APP_URL must be the HTTPS base URL of the deployed Wavo app.");
}
if (!cronSecret || cronSecret.length < 32) {
  throw new Error("CRON_SECRET must match the secret configured in the Wavo app and contain at least 32 characters.");
}
if (!Number.isInteger(intervalMs) || intervalMs < 2000 || intervalMs > 60000) {
  throw new Error("WORKER_INTERVAL_MS must be an integer between 2000 and 60000.");
}
if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 5000 || requestTimeoutMs > 120000) {
  throw new Error("WORKER_REQUEST_TIMEOUT_MS must be an integer between 5000 and 120000.");
}

const endpoints = [
  { name: "campaign", path: "/api/cron/campaign-worker" },
  { name: "webhook", path: "/api/cron/webhook-delivery" },
];

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    console.log(signal + " received; stopping after the current worker cycle.");
  });
}

async function invoke(endpoint) {
  const response = await fetch(appUrl + endpoint.path, {
    method: "POST",
    headers: { Authorization: "Bearer " + cronSecret, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });

  let body = {};
  try { body = await response.json(); } catch { /* Keep logs free of response bodies. */ }

  if (response.status === 401 || response.status === 403) {
    const error = new Error(endpoint.name + " worker rejected CRON_SECRET (HTTP " + response.status + ").");
    error.fatal = true;
    throw error;
  }
  if (!response.ok && response.status !== 202 && response.status !== 409 && response.status !== 429) {
    throw new Error(endpoint.name + " worker returned HTTP " + response.status + ".");
  }
  return {
    name: endpoint.name,
    httpStatus: response.status,
    success: body.success !== false,
    processed: Number(body.processed || 0),
    delivered: Number(body.delivered || 0),
    retried: Number(body.retried || 0),
    failed: Number(body.failed || 0),
  };
}

console.log("Wavo background worker started.");
console.log("App:", appUrl);
console.log("Polling interval:", intervalMs + "ms");
console.log("Workers:", endpoints.map((item) => item.name).join(", "));

while (!stopping) {
  const cycleStarted = Date.now();
  const results = await Promise.allSettled(endpoints.map(invoke));
  let fatalError = null;

  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === "fulfilled") {
      console.log(new Date().toISOString(), JSON.stringify(result.value));
    } else {
      const error = result.reason;
      console.error(new Date().toISOString(), endpoints[index].name + " worker:", error?.message || "request failed");
      if (error?.fatal) fatalError = error;
    }
  }

  if (fatalError) {
    console.error(fatalError.message);
    process.exitCode = 1;
    break;
  }

  const remaining = intervalMs - (Date.now() - cycleStarted);
  if (!stopping && remaining > 0) await sleep(remaining);
}

console.log("Wavo background worker stopped.");
