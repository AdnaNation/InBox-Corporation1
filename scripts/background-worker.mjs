import { setTimeout as sleep } from "node:timers/promises";
import { parseBackgroundWorkerConfig, summarizeWorkerResponse } from "../src/lib/background-worker-core.mjs";

const { appUrl, cronSecret, intervalMs, requestTimeoutMs } = parseBackgroundWorkerConfig(process.env);

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

  let body = null;
  try { body = await response.json(); } catch { /* Never log response bodies. */ }
  return summarizeWorkerResponse(endpoint.name, response.status, body);
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
