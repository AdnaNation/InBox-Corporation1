# WhatsApp provider adapter architecture

**Status:** design proposal; no provider behavior is enabled by this document.

## Why this is needed

Wavo currently implements the Meta WhatsApp Cloud API directly in account connection, text/template sending, campaign delivery, template lookup, health checks, and webhook ingestion. The saved account model is Meta-specific (`wabaId`, `phoneNumberId`, encrypted Meta access token). There is no Twilio or other Business Solution Provider (BSP) adapter in the current application.

Do not expose a provider selector in the customer UI until the corresponding connection, sending, webhook, status, and health paths are implemented and tested end to end.

## Product direction

Support two connection modes without making the rest of Wavo depend on provider-specific payloads:

1. **Meta Cloud API (direct):** customer authorizes Wavo's Meta app through Embedded Signup. Wavo stores the granted WABA/phone identifiers and encrypted access token. Meta webhooks are verified with the Wavo Meta app secret.
2. **BSP connection (initial candidate: Twilio):** customer connects a provider account/sender using provider-issued credentials and the provider's WhatsApp sender onboarding. Wavo stores encrypted provider credentials and provider sender identifiers. Provider webhooks use the provider's own signature-validation rules.

A workspace may eventually have more than one connected sender, including different providers. The existing active-number selection remains a workspace preference, not a provider selection.

## Provider-neutral account shape

Retain the existing fields during migration. Add explicit fields:

- `provider`: `meta_cloud_api` or `twilio` (required for new records; legacy records resolve to `meta_cloud_api`).
- `providerAccountId`: provider account/business identifier where applicable.
- `providerSenderId`: canonical sender identifier used by that provider.
- `senderAddress`: normalized WhatsApp address used for display and recipient routing.
- `credentialsEncrypted`: encrypted provider-specific credential bundle. Never return this field to the browser.
- `connectionMethod`: embedded signup, manual Meta token, or provider credential flow.
- `capabilities`: server-derived capability snapshot, not customer-editable permissions.

Meta-specific fields (`wabaId`, `phoneNumberId`, token expiry metadata) remain for Meta accounts. Twilio-specific identifiers must not be placed in those fields merely to satisfy old code.

The current partial unique index on connected Meta `phoneNumberId` must become provider-aware before non-Meta senders are stored. Enforce uniqueness on the pair `provider + providerSenderId`, and preserve the one-active-sender-per-workspace invariant. Migration must detect duplicates and fail closed rather than silently moving a sender between workspaces.

## Adapter contract

Provider adapters live under `src/lib/whatsapp-providers/` and are server-only modules. The rest of Wavo must use normalized inputs and outputs.

Required operations:

- `connect(input, context)`: validate provider credentials and sender ownership; return normalized account metadata and encrypted credential material.
- `sendText(account, message)`: send a free-form message where the provider and WhatsApp service window permit it.
- `sendTemplate(account, message)`: send an approved provider template using normalized template name/language/parameters.
- `listTemplates(account, cursor)`: return normalized template metadata and pagination.
- `checkHealth(account)`: return normalized healthy/attention/unavailable state and safe diagnostics.
- `verifyWebhook({ headers, rawBody, url, account })`: validate the provider signature before parsing or processing the event.
- `parseWebhook(payload, account)`: normalize inbound messages and delivery/read/failure statuses into Wavo's internal event format.

Normalized send result:

```js
{
  accepted: true,
  providerMessageId: "provider-specific-id",
  status: "accepted",
  rawProviderStatus: "queued"
}
```

A timeout, lost connection, 5xx response, or accepted response without a provider message ID is an **unknown outcome**, not a safe retry. Preserve the existing no-automatic-duplicate-send rule across every provider.

## Internal normalized events

Inbound message:

```js
{
  type: "message.received",
  provider: "meta_cloud_api",
  providerMessageId: "...",
  senderId: "...",
  recipientId: "...",
  from: "+...",
  timestamp: "ISO-8601",
  message: { type: "text", text: "..." }
}
```

Status update:

```js
{
  type: "message.status",
  providerMessageId: "...",
  status: "sent" | "delivered" | "read" | "failed",
  timestamp: "ISO-8601",
  error: null
}
```

The persistence layer continues using Wavo's existing `messages`, `conversations`, and `whatsappContacts` collections. Store `provider` and `providerMessageId` alongside the existing Meta `waMessageId`; add a unique index scoped by provider and provider message ID. Keep the old Meta unique index during migration until all legacy records are backfilled and verified.

## Webhook routing

Use distinct provider-specific webhook endpoints rather than trying to validate all providers with `META_APP_SECRET`:

- Meta: existing `/api/whatsapp/webhook`.
- Twilio: dedicated `/api/whatsapp/webhook/twilio`.

Each route must read the raw request body, identify the correct connected sender/account, validate the signature with that provider's documented algorithm and canonical URL rules, and only then parse and normalize the event. Never trust a workspace ID supplied in an unsigned webhook payload. Reject unknown senders and invalid signatures. Keep idempotent event/message persistence so provider retries do not create duplicate inbox messages.

## Twilio-specific requirements before implementation

- Confirm the exact Twilio WhatsApp onboarding model and whether the sender is approved/active for the customer's intended use.
- Store Account SID and Auth Token only as encrypted server-side credentials; never expose the Auth Token again after connection.
- Use the Twilio Messages API with authenticated server-side requests. Do not reuse Meta Graph payloads.
- Map Twilio Content Templates to Wavo's normalized template model, and clearly mark any unsupported Meta template components/parameters.
- Validate Twilio webhook signatures against the exact externally visible URL and raw form parameters, including proxy/host handling. Use Twilio's maintained validation implementation where practical; do not hand-roll a partial signature check.
- Normalize Twilio message states (for example queued/sending/sent/delivered/read/failed/undelivered) into Wavo's status model while retaining the original provider status.
- Surface provider-specific rate limits, sender restrictions, opt-in requirements, and message charges. Never imply that a Wavo subscription includes provider messaging fees unless the plan explicitly says so.

## Required refactor sequence

1. Add provider constants, account normalization, and a Meta adapter that preserves current behavior. Legacy records without `provider` resolve to Meta.
2. Add provider-aware account uniqueness/index migration and tests.
3. Refactor text and template sends to use the adapter, retaining the 24-hour window, opt-out suppression, usage reservation, and ambiguous-outcome handling.
4. Refactor campaign template verification and campaign worker delivery to use the selected sender's adapter. Keep per-sender leases and no-duplicate semantics.
5. Refactor health checks and template listing to the adapter.
6. Add provider-specific webhook routes and normalized event processing. Keep the existing Meta webhook behavior unchanged during the migration.
7. Add Twilio connection UX and encrypted credential storage only after the server adapter and signature tests pass.
8. Add integration tests for each provider's connect, send, template, webhook signature, duplicate event, status mapping, timeout, and disconnect paths.
9. Only then expose provider selection in the dashboard and customer documentation.

## Safety and migration gates

- Do not migrate or rewrite existing customer account records until a backup and rollback plan are documented.
- Do not change Meta account behavior as part of the first adapter commit.
- Do not allow a provider's credentials or raw webhook payload to reach client components or logs.
- Preserve workspace scoping on every account, conversation, message, campaign, and webhook lookup.
- Preserve live consent/suppression checks immediately before every send.
- Provider switches must not silently reroute queued campaigns. A campaign must retain the exact sender/provider selected when it was queued.
- Keep billing separate from provider credentials. Provider message charges and Wavo subscription charges are distinct ledgers.

## Current implementation status

| Area | Meta Cloud API | Twilio/BSP |
|---|---|---|
| Account connection | Implemented | Not implemented |
| Text messages | Implemented | Not implemented |
| Template messages | Implemented | Not implemented |
| Campaign delivery | Implemented | Not implemented |
| Inbound webhook | Implemented | Not implemented |
| Delivery status webhook | Implemented | Not implemented |
| Health monitoring | Implemented | Not implemented |
| Provider-specific billing/usage | Meta pricing analytics exists | Not implemented |

This document is an architecture plan, not a claim that Twilio support is available.
