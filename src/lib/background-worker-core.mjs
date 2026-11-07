export function parseBackgroundWorkerConfig(env = process.env) {
  const rawAppUrl = env.WAVO_APP_URL?.trim().replace(/\/$/, "");
  if (!rawAppUrl) throw new Error("WAVO_APP_URL must be the HTTPS base URL of the deployed Wavo app.");

  let appUrl;
  try {
    const parsed = new URL(rawAppUrl);
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password
      || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error();
    }
    appUrl = parsed.origin;
  } catch {
    throw new Error("WAVO_APP_URL must be an HTTPS app origin without credentials, path, query, or hash.");
  }

  const cronSecret = env.CRON_SECRET;
  if (typeof cronSecret !== "string" || cronSecret.length < 32) {
    throw new Error("CRON_SECRET must match the secret configured in the Wavo app and contain at least 32 characters.");
  }

  const intervalMs = Number(env.WORKER_INTERVAL_MS || 5000);
  if (!Number.isInteger(intervalMs) || intervalMs < 2000 || intervalMs > 60000) {
    throw new Error("WORKER_INTERVAL_MS must be an integer between 2000 and 60000.");
  }

  const requestTimeoutMs = Number(env.WORKER_REQUEST_TIMEOUT_MS || 45000);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 5000 || requestTimeoutMs > 120000) {
    throw new Error("WORKER_REQUEST_TIMEOUT_MS must be an integer between 5000 and 120000.");
  }

  return { appUrl, cronSecret, intervalMs, requestTimeoutMs };
}

export function summarizeWorkerResponse(endpointName, status, body) {
  if (status === 401 || status === 403) {
    const error = new Error(endpointName + " worker rejected CRON_SECRET (HTTP " + status + ").");
    error.fatal = true;
    throw error;
  }

  const expectedBody = body && typeof body === "object" && !Array.isArray(body)
    && typeof body.success === "boolean";
  if (!expectedBody) {
    throw new Error(endpointName + " worker returned an invalid JSON response (HTTP " + status + ").");
  }

  const acceptedNon2xx = [202, 409, 429].includes(status);
  if ((status < 200 || status >= 300) && !acceptedNon2xx) {
    throw new Error(endpointName + " worker returned HTTP " + status + ".");
  }
  if (acceptedNon2xx && body.success !== false) {
    throw new Error(endpointName + " worker returned an unexpected HTTP " + status + " response.");
  }

  return {
    name: endpointName,
    httpStatus: status,
    success: body.success,
    processed: Number(body.processed || 0),
    delivered: Number(body.delivered || 0),
    retried: Number(body.retried || 0),
    failed: Number(body.failed || 0),
  };
}
