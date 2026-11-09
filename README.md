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

## Manual customer-owned Meta App connection

Wavo's WhatsApp connection flow uses each customer's own Meta App. Customers do not need to authorize the Wavo Meta App for this manual connection path.

Configure these shared server environment variables locally and in the deployment:

```env
META_GRAPH_API_VERSION=v26.0
ENCRYPTION_KEY=64_character_hex_key
```

Each workspace owner/admin enters the following in **Dashboard → WhatsApp**:

- Their Meta App ID and matching App Secret.
- A webhook verify token they create (at least 8 characters).
- A WhatsApp access token issued by that same Meta App, with `whatsapp_business_management` and `whatsapp_business_messaging`.
- WABA ID and Phone Number ID.
- A public HTTPS Wavo webhook callback URL (maximum 200 characters).

Wavo validates the token with that customer's App ID/App Secret, verifies that the Phone Number ID belongs to the WABA, encrypts all credentials at rest, subscribes the customer's Meta App to the WABA, and applies a WABA-level callback override to Wavo. Incoming webhooks are verified with that workspace's encrypted App Secret and routed by WABA ID plus Phone Number ID. Outbound messages use that workspace's encrypted WhatsApp access token.

### Configure the customer's Meta App

1. In the customer's Meta App dashboard, enable the WhatsApp product and make sure the app has the `messages` webhook field subscribed.
2. In Wavo → Dashboard → WhatsApp, copy the public HTTPS callback URL and the webhook verify token entered for that workspace.
3. Complete the manual connection. Wavo subscribes the customer's App to its WABA and sets a WABA-level callback override to the Wavo URL.
4. Send a controlled inbound message and verify that it appears in the correct Wavo workspace. Test an outbound reply from the Wavo inbox.

The WABA-level override does not change the customer's Meta App default callback URL. However, while the override is active, supported message webhooks for that WABA go to Wavo instead of the default callback. If the customer's website also needs those same events while Wavo is connected, an authenticated webhook relay must be implemented and tested; Meta does not automatically duplicate them to both callback URLs.

When Wavo disconnects the number, it removes only its WABA-level override and restores the customer's previous WABA subscription state. If the customer's App was already subscribed before Wavo, the app subscription remains and Meta falls back to the customer's original app-level callback URL. If Wavo created the subscription, it removes that subscription to restore the prior state. Wavo fails closed if someone changes the callback override outside Wavo.

Use a public development tunnel for local testing. Meta cannot reach `localhost`. Never commit customer Meta App Secrets, webhook verify tokens, WhatsApp access tokens, or `.env.local` to source control.

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
- Customer Meta App permissions, token-lifecycle handling and customer offboarding automation. Scheduled Meta account-health checks and owner email alerts are implemented, but only run after the always-on background worker is deployed and configured (incoming webhook signatures use each connected workspace's encrypted Meta App Secret; the global `META_APP_SECRET` is only a legacy-connection fallback).
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

Add this variable in Vercel Project Settings → Environment Variables, then redeploy. It is not a `NEXT_PUBLIC_` variable. Workspace owners and admins do not automatically receive platform-wide access. The console can review plan requests, activate plans, configure the BDT/USD prices displayed to customers, change workspace plans, suspend/reactivate workspaces, and review customer export/deletion requests; actions are recorded in `platformAdminAuditLogs`. Published plan prices are informational only until a payment provider is approved and integrated. Data request completion is an operator attestation and does not automatically export or delete records. Plan activation is manual and does not collect payment.

## Vercel deployment

1. Push this project to a private GitHub repository.
2. Import it into Vercel.
3. Add the environment variables from `.env.example` in Vercel Project Settings.
4. Add your production domain to `NEXT_PUBLIC_APP_URL`.
5. Deploy.
6. Configure each customer Meta App with the callback URL and verify token shown in Dashboard → WhatsApp. Wavo applies the WABA-level callback override during connection; no global `META_WEBHOOK_VERIFY_TOKEN` is required for new customer connections.

Do not commit `.env.local` or store Meta access tokens in client-side code.

## Data model

Collections: `users`, `workspaces`, `memberships`, `contacts`, `whatsappAccounts`, `messages`, `webhookEvents`.

All tenant-owned queries must include the authenticated `workspaceId`.


## WhatsApp message pricing estimates

The Campaigns screen displays an indicative Bangladesh WhatsApp Business Platform rate card and estimates a selected campaign's message cost from the audience size and Meta-approved template category. The reference rates are USD $0.0732 per marketing message and $0.0037 per utility or authentication message, effective 1 October 2026. The BDT display uses an illustrative BDT 124 per USD conversion and is not a live exchange rate.

These estimates assume all recipients have Bangladesh (+880) numbers and all messages are delivered. Meta pricing depends on the recipient's country, message category, eligibility for free-entry-point windows, applicable volume tiers, and rate-card changes. Service replies have a separate monthly free allowance (first 1,000 eligible service messages per WhatsApp Business phone number); the campaign estimator covers template messages only. Verify current rates with Meta before budgeting or sending.

Wavo subscription fees do not include Meta WhatsApp messaging charges. Under the current customer-owned billing model, Meta charges the customer's connected WhatsApp Business Account directly. Traditional SMS is a separate channel and is not included in this WhatsApp estimate.
