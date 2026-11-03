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
2. Copy `.env.example` to `.env.local`.
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

## Included

- Public landing page
- Registration, login and logout
- JWT session stored in HttpOnly cookie
- Transactional user + workspace + owner membership creation
- Protected dashboard
- Workspace-scoped contacts CRUD
- WhatsApp account credentials stored encrypted at rest
- Send an approved WhatsApp template to a contact
- Meta webhook verification and inbound/status event storage
- Health endpoint
- Vercel-ready Next.js application

## Important production work still required

This is a runnable MVP foundation, not a finished, audited commercial SaaS. Before accepting real customers or sending campaigns, implement and test:

- Email verification, password reset, login/registration rate limiting and bot protection
- CSRF/origin policy appropriate for custom domains and preview deployments
- Admin provisioning and audited role management
- Meta Embedded Signup and proper OAuth token lifecycle
- Webhook signature verification using `META_APP_SECRET` (the included webhook endpoint verifies the challenge but deliberately does not trust unsigned POST events)
- Production queue scheduling, configurable per-number pacing, lease recovery, operator review tools and monitoring for the campaign worker
- Subscription billing, usage metering and payment webhook verification
- Consent evidence, suppression lists, opt-out handling, template approval checks and policy enforcement
- Data retention, exports/deletion, monitoring, backups and security review

The single-contact endpoint sends one approved template to one opted-in contact. Campaign drafts require explicit queueing. The protected campaign worker processes one recipient per invocation and requires a CRON_SECRET of at least 32 characters. Configure that secret in the deployment environment and call GET or POST /api/cron/campaign-worker with Authorization: Bearer <CRON_SECRET>. Vercel Cron uses GET; a cron schedule must be added to vercel.json after confirming the Vercel plan supports the desired frequency. Do not expose the secret in browser code. Ambiguous network outcomes and processing leases older than five minutes are marked unknown for manual reconciliation; they are not automatically resent. Workspace users can pause queued/sending campaigns and resume paused campaigns from the campaign review page. A request already in flight may still finish after pausing. HTTP 401/403 from Meta pauses the campaign and leaves that recipient pending until the account is repaired. Recipients marked unknown can be manually reconciled from the campaign review page as delivered or failed, with an audit note, reviewer and timestamp. Manual reconciliation never sends or retries a message. Campaign worker invocations also acquire a database lease keyed by WhatsApp Phone Number ID, preventing concurrent sends through the same number across campaigns. A successful worker invocation enforces a two-second cooldown before that number can be claimed again; abandoned leases expire after 90 seconds.

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
