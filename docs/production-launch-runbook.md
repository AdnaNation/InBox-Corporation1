# Wavo production launch runbook

This runbook turns the current application setup into a controlled pilot checklist. It does not certify Meta approval, payment-provider onboarding, legal compliance, or production infrastructure. Record the result and date for every check; do not mark a gate complete based only on a successful build.

## 1. Launch stages

Use these stages in order:

1. **Internal verification:** the owner and trusted testers use a dedicated workspace and test contacts.
2. **Controlled pilot:** a small number of invited businesses use the product after the worker, Meta access, support process, and data-handling checks below are complete.
3. **Paid public launch:** begin only after billing, legal review, monitoring, backups, support, and offboarding are operational and tested.

Do not accept paid public customers while any critical gate is unresolved. Keep manual plan activation as the billing fallback until an approved payment provider is integrated and its signed notifications are tested.

## 2. Deployment inventory

Record these values in the operator's private deployment notes (never commit secrets):

| Item | Expected configuration | Verification |
| --- | --- | --- |
| Web application | Vercel production project and production domain | Deployment is Ready; latest main commit is the deployed source |
| Database | MongoDB Atlas production database | Connection works; backups and restore procedure are enabled and tested |
| Background worker | One always-on worker process | Logs show campaign and webhook polling; health check runs at its configured interval |
| Worker authentication | CRON_SECRET in Vercel and worker | Same randomly generated value, at least 32 characters; never exposed to browser code |
| Email | Resend API key and verified sender | Verification and password-reset messages arrive at real test inboxes |
| WhatsApp | Meta app, approved permissions, WABA and production phone | Real account can send and receive a controlled test message |
| Operations | Named operator, alert destination, incident log | An operator can pause campaigns and respond to failed/unknown outcomes |

## 3. Start the background worker

The web app does not process queued campaigns continuously by itself. The worker is a separate process; a successful Vercel deployment does not mean the worker is running.

1. Choose an always-on Node.js worker host. Confirm its current price, restart behavior, sleep policy, region, log retention, and secret-management support before creating a paid service.
2. Create a Background Worker service from the same Git repository and deploy the intended production branch.
3. Use Node.js 20.9 or newer, build command npm install, and start command npm run worker.
4. Set these worker environment variables in the host's private settings:
   - WAVO_APP_URL=https://inbox-corporation-new.vercel.app (replace with the canonical production origin if it changes; no trailing slash).
   - CRON_SECRET: the exact production secret configured in Vercel.
   - WORKER_INTERVAL_MS=5000 (optional; default).
   - WORKER_REQUEST_TIMEOUT_MS=45000 (optional; default).
   - WORKER_HEALTH_INTERVAL_MS=900000 (optional; default 15 minutes).
5. Start one worker instance first. Do not scale horizontally just to increase send speed; WhatsApp-number leases and platform policy limits still apply.
6. Confirm logs show successful campaign and webhook polling. Confirm a WhatsApp health summary appears at startup and at the configured interval.
7. Confirm an incorrect/missing secret causes a clear authentication/configuration failure, then restore the correct secret without printing it in logs.
8. Restart the worker and confirm it comes back automatically. Restarting must not create duplicate campaign sends.

Never paste CRON_SECRET, Meta access tokens, app secrets, database connection strings, or API-key values into issues, screenshots, chat, or committed files.

## 4. Pre-pilot verification

Use a dedicated test workspace, a phone number controlled by the business, and contacts that explicitly opted in. Do not use purchased lists or real customer contacts for smoke tests.

### Account and email

- [ ] Register a new test account and verify the email message arrives.
- [ ] Open the verification link once; confirm it succeeds and cannot be reused.
- [ ] Request a password reset; confirm the message arrives and the link expires after use/expiry.
- [ ] Reset the password and confirm previously issued sessions are invalidated.
- [ ] Confirm unknown and known email addresses receive the same password-reset request response.

### Workspace and access boundaries

- [ ] Create a second test workspace with a different user.
- [ ] Confirm contacts, conversations, campaigns, templates, API keys, webhooks, usage, and settings from one workspace are not visible or mutable from the other.
- [ ] Invite a team member and test the intended role permissions.
- [ ] Confirm a non-platform-admin cannot access platform administration routes or actions.

### WhatsApp connection and inbox

- [ ] Complete Embedded Signup with the intended production business and phone number.
- [ ] Confirm the connected WABA and phone-number identifiers belong to that business.
- [ ] Confirm the Meta app has the required approved access and is not relying on temporary test credentials.
- [ ] Send one approved template to an opted-in test recipient.
- [ ] Send a reply from the recipient phone and confirm it appears in the correct workspace conversation.
- [ ] Confirm delivered/read/failed status updates are reflected where supported.
- [ ] Confirm the 24-hour customer-service window is enforced for free-form replies.
- [ ] Disconnect or invalidate a test connection and confirm the health status becomes visible to the workspace owner after the worker check.

### Consent, campaigns, and safety

- [ ] Import a small CSV containing only opted-in test contacts.
- [ ] Confirm an opted-out or suppressed contact is skipped at send time, even if it was included in an earlier campaign audience.
- [ ] Create a campaign draft, review recipient count/template/parameters, then explicitly queue it.
- [ ] Confirm the worker processes recipients and usage is recorded exactly once.
- [ ] Pause a queued/sending campaign and confirm no new recipient is claimed after the pause is observed.
- [ ] Simulate an ambiguous or interrupted send only in a controlled test environment; confirm it becomes unknown for manual reconciliation and is not automatically resent.
- [ ] Confirm a Meta authentication rejection pauses the campaign instead of repeatedly retrying.
- [ ] Confirm an exhausted/failed webhook is visible for operator follow-up and does not retry forever.

### API keys and outbound webhooks

- [ ] Create a scoped API key and verify only the granted permissions work.
- [ ] Confirm the raw key is shown only at creation and is not recoverable from the database/UI later.
- [ ] Revoke the key and confirm subsequent requests fail.
- [ ] Configure a webhook to a controlled HTTPS endpoint; verify signature, timestamp, delivery ID, retry behavior, and duplicate-event handling.
- [ ] Confirm private, loopback, link-local, and otherwise disallowed webhook destinations are rejected.

### Billing and plans

- [ ] Confirm plan limits are enforced server-side, not only hidden in the UI.
- [ ] Confirm a customer cannot change their own plan, price, payment status, or usage balance through browser requests.
- [ ] Confirm manual plan activation creates the expected audit record.
- [ ] Keep automatic payment collection disabled until provider approval, signed webhook verification, amount/currency checks, idempotency, refunds, cancellations, and failed-renewal behavior are tested.

## 5. Production data protection

Before onboarding real customer data:

- Enable automated MongoDB Atlas backups/PITR where available for the selected cluster tier.
- Restrict database access to the application and named operators; use separate credentials for environments.
- Test a restore into a separate database. A backup that has never been restored is not a verified recovery plan.
- Document retention periods for contacts, messages, campaign records, webhook payloads, audit logs, and backups.
- Document how a customer can request a copy/export of workspace data and how an authorized deletion request is authenticated, reviewed, executed, and confirmed.
- Do not promise immediate deletion from backups unless the backup retention policy supports it. Document backup expiry and legal/security exceptions.
- Keep an auditable record of deletion requests and completion without retaining unnecessary personal data in that record.
- Review who can access production data and why; remove access when no longer needed.

### Workspace data request workflow

Workspace owners can submit export or deletion-review requests from **Dashboard → Settings → Your workspace data**. Requests are stored in the `workspaceDataRequests` collection and appear in the platform-admin console. Only the workspace owner can submit/view requests; duplicate active requests of the same type are blocked. Status changes are recorded in both platform and workspace audit logs.

The request queue is an intake and review workflow only. It does **not** generate or deliver exports, delete workspace records, revoke integrations, or notify customers automatically. Operators must complete those actions manually and only after verifying the requester and applicable obligations:

1. Open the request in Platform administration and move it to **In review**. Verify the requester controls the workspace using the authenticated account and a trusted support channel. Do not accept an unverified email-only request to delete another workspace.
2. For an export, define the scope and format, generate it in a restricted environment, check that it contains only the requester's workspace data, and transfer it through an access-controlled channel. Mark it **Completed** only after secure delivery.
3. For deletion, identify all workspace-owned records and external connections first. Check pending campaigns, webhook deliveries, invoices/financial records, abuse/security holds, and applicable legal retention obligations before acting.
4. Revoke API keys, disable integrations, stop queued campaigns, and disconnect/revoke the customer's Meta connection as appropriate. Do not delete another customer's shared platform configuration.
5. Delete or anonymize only the records covered by the approved request and applicable retention policy. Confirm database queries are workspace-scoped and review the affected record counts before destructive actions.
6. Verify the workspace can no longer authenticate or access deleted data, and document any retained records, reason, and scheduled expiry.
7. Mark the request **Completed** only after the approved work is finished. Reject requests that cannot be fulfilled and communicate the reason through the verified support channel. Escalate uncertain legal, billing, security, or cross-workspace cases rather than guessing.

Do not promise immediate deletion from backups unless the backup retention policy supports it. The queue's **Completed** status is an operator attestation, not proof of automatic erasure.

## 6. Incident response

For suspected account compromise, accidental messaging, data exposure, or a major outage:

1. Stop the affected campaign(s) and, if needed, stop the worker. Do not delete queues or records while investigating.
2. Revoke affected user sessions, API keys, webhook secrets, or Meta credentials using the appropriate supported control.
3. Preserve relevant timestamps, request IDs, delivery IDs, campaign IDs, and sanitized logs. Never copy passwords, bearer tokens, access tokens, or message content into a public issue.
4. Identify affected workspaces and data categories; do not assume a single tenant was affected.
5. Notify the responsible operator and obtain legal/privacy advice on any required customer, regulator, or platform notification.
6. Restore service only after the cause is understood, credentials are rotated where necessary, and a controlled test passes.
7. Record root cause, impact, remediation, and follow-up tests.

For a campaign with recipients marked unknown, do not retry automatically. Review Meta delivery evidence and reconcile each recipient with an audit note, reviewer, and timestamp.

## 7. Go/no-go gates

### Controlled pilot — all must be true

- [ ] Production build and CI are green for the deployed commit.
- [ ] Database backups are enabled and a restore test has succeeded.
- [ ] Always-on worker is running and survives a restart.
- [ ] Meta production app permissions, business eligibility, and token lifecycle are verified.
- [ ] One controlled inbound/outbound WhatsApp test succeeds.
- [ ] Email verification and password reset work end to end.
- [ ] Tenant isolation, opt-out suppression, campaign pause, and unknown-send safeguards pass.
- [ ] A named operator can pause messaging and handle a support/security incident.
- [ ] Pilot customers are informed that billing/feature availability may still be manual.

### Paid public launch — all pilot gates plus

- [ ] Qualified legal review of Terms and Privacy Policy, including correct legal entity, jurisdiction, contact details, data roles, retention, and customer obligations.
- [ ] A real, approved payment provider is integrated; signed callbacks and server-side transaction validation are tested.
- [ ] Customer export and deletion process is implemented or an adequately staffed, documented manual service process is in place.
- [ ] Monitoring and alert delivery are tested, with an on-call owner and escalation procedure.
- [ ] Pricing, limits, refunds, cancellation, renewals, taxes, and support commitments are published accurately.
- [ ] Customer onboarding, offboarding, Meta disconnect, and incident-response procedures have been rehearsed.

If any critical gate is unchecked, keep the product in internal verification or controlled pilot rather than advertising unrestricted paid availability.

## 8. Release record

For each release, record:

- Release date and operator:
- Git commit SHA:
- Vercel production deployment URL and state:
- Worker release/host and last successful poll:
- MongoDB backup/restore verification date:
- Meta production connection test date:
- Email delivery test date:
- Open incidents or known limitations:
- Pilot/public-launch decision and approver:
