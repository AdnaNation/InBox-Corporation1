# Wavo background worker deployment

## Why this is separate from Vercel

The Vercel Hobby plan does not support the frequent scheduled execution needed for campaign processing and webhook retries. Keep the Next.js app on Vercel, and run this small Node.js polling process on an always-on background-worker host (for example, a Render Background Worker, Railway worker, Fly Machine, or your own VPS).

The worker calls the app's existing protected endpoints. MongoDB leases and idempotency checks remain in the application, so running more than one worker does not bypass the campaign phone-number lease or webhook-delivery lease.

## Configure the app (Vercel)

In the Vercel project's Production environment variables, set:

- `CRON_SECRET`: a randomly generated secret with at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- Keep the same value private and use it only in the background worker environment.

Do not add this secret to any `NEXT_PUBLIC_*` variable or commit it to Git. Redeploy the app after changing its environment variables.

## Deploy the worker

Create a separate **Background Worker** service from this repository. Do not create another Vercel deployment for the worker.

- Runtime: Node.js (20.9 or newer)
- Build command: `npm install`
- Start command: `npm run worker`

Set these environment variables on the worker service:

| Variable | Value |
| --- | --- |
| `WAVO_APP_URL` | Your production app origin, e.g. `https://your-wavo-domain.com` (no trailing slash) |
| `CRON_SECRET` | Exactly the same secret configured in Vercel |
| `WORKER_INTERVAL_MS` | Optional; defaults to `5000` (5 seconds) |
| `WORKER_REQUEST_TIMEOUT_MS` | Optional; defaults to `45000` (45 seconds) |
| `WORKER_HEALTH_INTERVAL_MS` | Optional; defaults to `900000` (15 minutes); allowed range 1 minute–24 hours |

The process invokes `POST /api/cron/campaign-worker`, `POST /api/cron/webhook-delivery`, on every polling cycle. The WhatsApp health monitor runs separately on `WORKER_HEALTH_INTERVAL_MS` (15 minutes by default), checks connected Meta phone-number tokens and queues owner email alerts for status changes. The campaign worker processes at most one recipient per invocation and enforces the per-WhatsApp-number database lease/cooldown. The webhook worker claims a bounded batch and retries failures with exponential backoff. The WhatsApp health monitor checks connected Meta phone-number tokens and queues owner email alerts for status changes. The worker does not store Meta tokens or connect directly to MongoDB.

## Operational notes

- Start with one worker instance. The database leases protect critical work, but one instance is sufficient and avoids unnecessary polling.
- Watch the worker logs for HTTP 401/403; these indicate that `CRON_SECRET` is missing or does not match. The process exits on this configuration error.
- Transient network/5xx failures are logged and retried on the next cycle.
- Keep the worker running continuously. Pausing or stopping it delays scheduled campaigns and webhook delivery; it does not delete queued work.
- Do not configure a Vercel Hobby Cron schedule for these endpoints. A once-daily schedule is not a substitute for a continuously running worker.
- The host may charge for an always-on worker. Check its current pricing and sleep policy before enabling it for production messaging.


## Run the worker with Docker Compose

A minimal container definition is included for a VPS or any Docker-compatible always-on host. It runs only the polling worker, not a second Next.js application.

1. Copy `.env.worker.example` to `.env.worker`.
2. Set `WAVO_APP_URL` to the deployed Wavo HTTPS origin.
3. Set `CRON_SECRET` to exactly the same secret configured in the Vercel Production environment.
4. Start the worker:

   ```bash
   docker compose -f docker-compose.worker.yml up -d --build
   ```

5. Inspect logs and confirm campaign and webhook summaries appear every polling cycle, and a WhatsApp health summary appears at startup and then at the configured health interval:

   ```bash
   docker compose -f docker-compose.worker.yml logs -f
   ```

The container runs as the unprivileged Node user, drops Linux capabilities, uses a read-only root filesystem, and restarts automatically after a host or process restart. Keep `.env.worker` private; it is ignored by Git. To stop the worker, run `docker compose -f docker-compose.worker.yml down`.

This container does not create a Vercel deployment and does not contain Meta credentials. It calls only the app's protected worker endpoints over HTTPS.
