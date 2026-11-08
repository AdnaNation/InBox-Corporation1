# WhatsApp SaaS — Next.js starter

JavaScript-only Next.js App Router starter for a multi-tenant WhatsApp Business messaging SaaS.

## Stack

- Next.js App Router (JavaScript / JSX)
- Tailwind CSS v4
- MongoDB Atlas using the official MongoDB Node.js driver (no Mongoose)
- bcryptjs password hashing
- jose JWT in HttpOnly cookies
- Zod request validation
- Meta WhatsApp Cloud API integration foundation

## Requirements

- Node.js 20.9+
- MongoDB Atlas database (Atlas replica set is required for registration transaction)
- Meta developer app and WhatsApp Business Platform account for real messaging

## Setup

1. Extract the ZIP.
2. Create `.env.local` and configure the required variables described in the sections below. The worker-specific template is `.env.worker.example`.
3. Set `MONGODB_URI` and generate `JWT_SECRET`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

5. Open http://localhost:3000 and register an account.
6. For campaign processing, generate a separate worker secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and set it as `CRON_SECRET` in the server environment.

## Email verification

New accounts receive a one-time verification link by email. Links expire after 24 hours; only a SHA-256 hash of each token is stored. Signed-in users can request another link from the dashboard, with resend requests rate-limited. Existing users can continue signing in while verification is pending; verification is currently a security reminder, not an access gate.

Configure these server-side Vercel environment variables:

```env
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=InBox Corporation <noreply@your-verified-domain.com>
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

The sender domain must be verified in Resend. Never expose `RESEND_API_KEY` through a `NEXT_PUBLIC_` variable.

## Password reset

Users can request a password reset from the sign-in page. Requests return the same confirmation for existing and unknown addresses, are rate-limited by email and IP, and send one-time links that expire after 1 hour. Only token hashes are stored. Resetting a password increments the account's session version, invalidating existing sessions across devices.

Password reset uses the same server-side `RESEND_API_KEY` and `EMAIL_FROM` configuration described above.

## Background worker

Vercel Hobby does not provide the frequent schedule needed for campaigns and webhook retries. Run the standalone Node.js worker on an always-on background-worker host. See [background worker deployment](docs/background-worker.md). Start command: `npm run worker`. The worker requires `WAVO_APP_URL` and the same 32+ character `CRON_SECRET` configured on the app. Keep one worker instance running and monitor its logs; queued campaigns and webhook deliveries do not progress while the worker is stopped.

Before onboarding pilot customers, follow the [production launch runbook](docs/production-launch-runbook.md) for worker setup, end-to-end smoke tests, data protection, incident response, and go/no-go gates.

## Tests

- `npm run lint` — ESLint checks.
- `npm run test:unit` — isolated unit tests, including worker configuration, email verification, password reset tokens, and session invalidation.
- `MONGODB_URI=... npm run test:integration` — MongoDB-backed integration tests for persistence, consent suppression, authentication rate limits, and password reset token constraints.

## Public API

The v1 Contacts API supports scoped API keys, contact reads/creates/updates, consent safeguards, and per-key rate limiting. See the [Public API guide](docs/public-api.md) for authentication, permissions, endpoints, examples, and error handling.

## Meta Embedded Signup v4

The WhatsApp settings page includes the v4 Embedded Signup flow. Configure these environment variables in Vercel (and locally in `.env.local`):

```env
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_EMBEDDED_SIGNUP_CONFIG_ID=your_v4_configuration_id
META_GRAPH_API_VERSION=v26.0
META_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token
ENCRYPTION_KEY=64_character_hex_key
```

Keep `META_APP_SECRET` and all other secrets server-side. Do not prefix them with `NEXT_PUBLIC_`. The app ID and configuration ID are returned by an authenticated server endpoint to initialize the Meta JavaScript SDK; neither is a secret.

In Meta for Developers:

1. Enable Facebook Login for Business and create a **WhatsApp Embedded Signup v4** configuration (do not reuse a retired v2/v3 configuration).
2. Select WhatsApp Cloud API, WhatsApp accounts, and the permissions your product needs: `whatsapp_business_management` and `whatsapp_business_messaging`. Complete Meta App Review / Advanced Access requirements before onboarding real customers.
3. Add your production domain to the Facebook Login for Business allowed JavaScript SDK domains and OAuth settings. Use HTTPS.
4. Configure the WhatsApp webhook callback as `https://YOUR_DOMAIN/api/whatsapp/webhook`, subscribe to the `messages` field, and use the same `META_WEBHOOK_VERIFY_TOKEN` in Meta and Vercel.
5. Set the app to Live when Meta has approved the required access and your business/provider setup is eligible.

After a customer finishes signup, the browser sends the short-lived authorization code and WABA/phone identifiers to the authenticated server route. The server exchanges the code immediately, verifies that the selected phone belongs to the granted WABA, subscribes the app to WABA webhooks, and stores the token encrypted. The raw token and app secret are never returned to the browser.

The current implementation supports the standard Cloud API signup path. It does not yet implement WhatsApp Business App coexistence onboarding, multi-number selection, partner credit-line sharing, billing, or automated token-expiry notifications. A different existing number is only replaced after the workspace admin explicitly checks the replacement confirmation; active campaigns block replacement.

## Google and Facebook social sign-in

The login and registration pages support Google and Facebook OAuth alongside email/password authentication. Configure these server-side environment variables in Vercel and locally in `.env.local`:

```env
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
FACEBOOK_CLIENT_ID=your_meta_app_id
FACEBOOK_CLIENT_SECRET=your_meta_app_secret
```

Register these exact HTTPS callback URLs with the providers:

- Google: `https://YOUR_DOMAIN/api/auth/google/callback`
- Facebook sign-in: `https://YOUR_DOMAIN/api/auth/facebook/callback`
- Facebook account linking (signed-in users): `https://YOUR_DOMAIN/api/auth/facebook/link/callback`

For Google, configure the production origin as an authorized JavaScript origin and the callback URL as an authorized redirect URI. For Facebook Login, enable Client OAuth Login, Web OAuth Login, Enforce HTTPS and Strict Mode, then add both Facebook callback URLs to Valid OAuth Redirect URIs and request the `email` permission.

OAuth state is checked with short-lived HttpOnly cookies. Google uses PKCE and validates the ID token signature, issuer, audience, nonce and verified email. Provider identities are stored separately with a unique provider/user ID index. If an email already belongs to a password account, Wavo deliberately refuses automatic linking; the user must first sign in with the existing method. Signed-in users can link Facebook from Dashboard → Settings → Connected sign-in methods; the callback requires the same active Wavo session and refuses an identity already linked to another user. A new social account receives its own Free workspace and owner membership. Keep all client secrets server-side and never expose them with a `NEXT_PUBLIC_` prefix.

## Included

- Public landing page
- Registration, login and logout
- One-time email verification links and a dashboard reminder for unverified accounts
- Password reset links with one-time tokens and cross-device session invalidation
- JWT session stored in HttpOnly cookie
- Transactional user + workspace + owner membership creation
- Protected dashboard
- Workspace-scoped contacts CRUD
- Owner-only workspace data export/deletion request intake with platform-admin review and audit history (fulfillment remains manual)
- WhatsApp account credentials stored encrypted at rest
- Send an approved WhatsApp template to a contact
- Meta webhook verification and inbound/status event storage
- Health endpoint
- Vercel-ready Next.js application

## Important production work still required

This is a runnable MVP foundation, not a finished, audited commercial SaaS. Before accepting real customers or sending campaigns, implement and test:

- Bot protection, account recovery and support workflows
- CSRF/origin policy appropriate for custom domains and preview deployments
- Admin provisioning and audited role management
- Meta Tech Provider eligibility, App Review / Advanced Access, token-lifecycle handling and customer offboarding automation. Scheduled Meta account-health checks and owner email alerts are implemented, but only run after the always-on background worker is deployed and configured (the webhook endpoint verifies Meta's `X-Hub-Signature-256` POST signatures using `META_APP_SECRET`).
- Production queue scheduling, configurable per-number pacing, lease recovery, operator review tools and monitoring for the campaign worker
- Subscription billing, usage metering and payment webhook verification
- Consent evidence, suppression lists, opt-out handling, template approval checks and policy enforcement
- Automated export delivery and deletion execution, data-retention policy enforcement, monitoring, backups and security review

The single-contact endpoint sends one approved template to one opted-in contact. Campaign drafts require explicit queueing. The protected campaign worker processes one recipient per invocation and requires a CRON_SECRET of at least 32 characters. Configure that secret in the deployment environment and call GET or POST /api/cron/campaign-worker with Authorization: Bearer <CRON_SECRET>. Vercel Cron uses GET; a cron schedule must be added to vercel.json after confirming the Vercel plan supports the desired frequency. Do not expose the secret in browser code. Ambiguous network outcomes and processing leases older than five minutes are marked unknown for manual reconciliation; they are not automatically resent. Workspace users can pause queued/sending campaigns and resume paused campaigns from the campaign review page. A request already in flight may still finish after pausing. HTTP 401/403 from Meta pauses the campaign and leaves that recipient pending until the account is repaired. Recipients marked unknown can be manually reconciled from the campaign review page as delivered or failed, with an audit note, reviewer and timestamp. Manual reconciliation never sends or retries a message. Campaign worker invocations also acquire a database lease keyed by WhatsApp Phone Number ID, preventing concurrent sends through the same number across campaigns. A successful worker invocation enforces a two-second cooldown before that number can be claimed again; abandoned leases expire after 90 seconds.

## Platform administration

The internal platform admin console is available at `/dashboard/platform-admin`. Access is restricted by the server-side `PLATFORM_ADMIN_EMAILS` environment variable: set it to a comma-separated list of exact account email addresses that should have platform-wide access. For example:

```env
PLATFORM_ADMIN_EMAILS=admin@example.com,owner@example.com
```

Add this variable in Vercel Project Settings → Environment Variables, then redeploy. It is not a `NEXT_PUBLIC_` variable. Workspace owners and admins do not automatically receive platform-wide access. The console can review plan requests, activate plans, configure the BDT/USD prices displayed to customers, change workspace plans, suspend/reactivate workspaces, and review customer export/deletion requests; actions are recorded in `platformAdminAuditLogs`. Published plan prices are informational until Paddle is configured. When Paddle is enabled, keep these display prices aligned with the matching Paddle catalog prices. Data request completion is an operator attestation and does not automatically export or delete records. Manual plan activation remains available only while checkout is disabled.

## Paddle recurring billing

Paddle Billing can process monthly and yearly subscriptions for Wavo. Create and verify a Paddle seller account, add your production domain to the approved checkout domains, and create three products (Starter, Growth, Business) with monthly and yearly recurring prices. Use the matching six Paddle price IDs in the environment variables below. Sandbox and live price IDs are different.

Configure these Vercel environment variables:

```env
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=your_paddle_client_side_token
PADDLE_ENVIRONMENT=sandbox
PADDLE_WEBHOOK_SECRET=your_notification_destination_secret
PADDLE_PRICE_STARTER_MONTHLY=pri_your_starter_monthly_price_id
PADDLE_PRICE_STARTER_YEARLY=pri_your_starter_yearly_price_id
PADDLE_PRICE_GROWTH_MONTHLY=pri_your_growth_monthly_price_id
PADDLE_PRICE_GROWTH_YEARLY=pri_your_growth_yearly_price_id
PADDLE_PRICE_BUSINESS_MONTHLY=pri_your_business_monthly_price_id
PADDLE_PRICE_BUSINESS_YEARLY=pri_your_business_yearly_price_id
```

Set `PADDLE_ENVIRONMENT=production` only when all six IDs, the client-side token, and webhook secret are from your live Paddle account. Checkout is enabled only when all six valid price IDs, a client-side token, and a webhook secret are present. The client-side token is designed for browser use; the webhook secret must remain server-side.

Create a Paddle notification destination pointing to `https://YOUR_DOMAIN/api/webhooks/paddle` and subscribe to `transaction.completed`, `subscription.created`, `subscription.updated`, and `subscription.canceled`. The webhook verifies the raw request body with Paddle's HMAC signature before changing subscription access. A completed recurring transaction activates the matching plan; past-due subscriptions receive a seven-day grace period; paused or canceled subscriptions fall back to Free. Duplicate notifications are recorded and do not reapply changes.

After configuring Paddle, set the customer-visible BDT/USD prices in Dashboard → Platform administration → Plan pricing to match the Paddle catalog. Checkout itself uses Paddle's catalog price IDs and Paddle calculates applicable checkout totals/taxes. The admin price editor is display-only.

The current release supports first-time recurring subscription checkout and webhook-driven activation/renewal/status updates. It deliberately blocks starting a second paid subscription for a workspace that already has one. Plan changes, cancellation self-service/customer portal, refunds, and invoice administration still require additional implementation before unrestricted commercial launch. Test the full flow in Paddle Sandbox and use its webhook simulator before switching to Live.

## Vercel deployment

1. Push this project to a private GitHub repository.
2. Import it into Vercel.
3. Add the environment variables from `.env.example` in Vercel Project Settings.
4. Add your production domain to `NEXT_PUBLIC_APP_URL`.
5. Deploy.
6. Configure the Meta webhook URL as `https://YOUR_DOMAIN/api/whatsapp/webhook`.
7. Set the same `META_WEBHOOK_VERIFY_TOKEN` in Meta and Vercel.

Do not commit `.env.local` or store Meta access tokens in client-side code.

## Data model

Collections: `users`, `workspaces`, `memberships`, `contacts`, `whatsappAccounts`, `messages`, `webhookEvents`.

All tenant-owned queries must include the authenticated `workspaceId`.
