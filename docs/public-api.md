# Public API v1 — Contacts

The public API lets an external system manage contacts inside one Wavo workspace. Every request is authenticated with a workspace-scoped API key. All endpoints use JSON over HTTPS.

> Base URL: `https://YOUR_WAVO_DOMAIN/api/v1`

## 1. Create an API key

In Wavo, open **Dashboard → API Keys** and create a key with only the permissions your integration needs. Choose an expiration of 30 days, 90 days (the recommended default), one year, or never. Expired keys are rejected automatically. Copy the secret when it is shown; store it in a server-side secret manager and never commit it or expose it in browser JavaScript.

API keys use the `ibx_live_` prefix. The API stores a hash, not the raw key. The default lifetime is 90 days; keys set to never expire omit the expiry timestamp. Revoke a key immediately if it is exposed.

## 2. Authentication and permissions

Send the key in the Authorization header:

```http
Authorization: Bearer ibx_live_YOUR_API_KEY
Content-Type: application/json
```

Available permissions:

| Permission | Allows |
| --- | --- |
| `contacts:read` | List contacts with `GET /contacts` |
| `contacts:write` | Create contacts and update contact name/tags |
| `messages:read` | Read delivery status for messages in this workspace |
| `messages:send` | Send approved WhatsApp templates to existing opted-in contacts |
| `templates:read` | List templates and their Meta approval status |
| `campaigns:read` | List campaign status and aggregate delivery progress |
| `campaigns:write` | Create campaign drafts from eligible opted-in contacts; does not queue or send them |
| `webhooks:read` | List webhook subscriptions and inspect delivery history |
| `webhooks:write` | Create and disable webhook subscriptions |

A key without the required permission receives `403`. Missing, invalid, revoked, or expired keys receive `401`. Keys are restricted to their own workspace; supplying another workspace ID is not supported.

## 3. Rate limits

Each API key can make up to **120 requests per UTC-aligned one-minute window** across public v1 endpoints. This is a fixed-window limit, not a rolling 60-second limit. The counter is shared through MongoDB, so requests across application instances use the same limit.

When the limit is exceeded, the API returns:

- HTTP `429 Too Many Requests`
- A `Retry-After` response header containing the number of seconds to wait
- A JSON error message

If the rate-limit store cannot be checked, the API fails closed with HTTP `503 Service Unavailable`. Retry transient `503` responses with exponential backoff. Do not retry `429` before the `Retry-After` interval.

## 4. List contacts

`GET /contacts`

Optional query parameter:

- `limit`: number of records to return, default `100`, maximum `500`, minimum `1`.
- `before`: the opaque `pagination.nextCursor` returned by the previous page.

The response includes `pagination.hasMore` and `pagination.nextCursor`. Pass the cursor as `before` to fetch the next page. Ordering uses `createdAt` and contact ID as a stable tie-breaker, so contacts sharing a timestamp are not skipped. Cursors are opaque; do not construct or edit them. Invalid cursors and limits return HTTP `400`.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/contacts?limit=100" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

Successful response:

```json
{
  "success": true,
  "data": [
    {
      "id": "66a000000000000000000001",
      "name": "Samira Ahmed",
      "phone": "+8801712345678",
      "tags": ["customer", "website"],
      "optedIn": false,
      "createdAt": "2026-11-06T10:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 100,
    "returned": 1,
    "hasMore": true,
    "nextCursor": "OPAQUE_CURSOR_FROM_RESPONSE"
  }
}
```

When `hasMore` is true, pass the cursor back unchanged to retrieve the next page:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/contacts?limit=100&before=$WAVO_NEXT_CURSOR" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

The cursor shown above is illustrative. Always use the exact `nextCursor` value returned by the API; do not decode, construct, or edit it. When `hasMore` is false, `nextCursor` is `null`.

The `optedIn` field reflects the workspace's recorded consent status. A contact being present in the address book does not mean it is eligible for marketing messages.

## 5. Get a contact

`GET /contacts/{contactId}` requires `contacts:read`. It returns one contact from the API key's workspace, including its recorded opt-in boolean and timestamps. It does not expose internal consent evidence or suppression records. A contact ID from another workspace is returned as `404`.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/contacts/66a000000000000000000001" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

## 6. Create a contact


`POST /contacts`

Required fields:

- `name`: string, 1–100 characters.
- `phone`: valid international phone number. Use E.164 format, including the country code.

Optional fields:

- `tags`: array of up to 10 non-empty strings, each up to 30 characters.
- `optedIn`: boolean. Omit or set to `false` unless you have valid consent evidence.
- `consentSource`: required when `optedIn: true`; one of `website_form`, `paper_form`, `verbal`, `whatsapp_initiated`, or `other`.
- `consentEvidence`: required when `optedIn: true`; 8–500 characters describing the evidence of consent.

Example — add a contact without claiming marketing consent:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/contacts" \
  -H "Authorization: Bearer $WAVO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Samira Ahmed",
    "phone": "+8801712345678",
    "tags": ["website", "customer"]
  }'
```

Example — record documented opt-in:

```json
{
  "name": "Samira Ahmed",
  "phone": "+8801712345678",
  "tags": ["website"],
  "optedIn": true,
  "consentSource": "website_form",
  "consentEvidence": "Checked the WhatsApp updates consent box on signup form 2026-11-06."
}
```

A successful create returns HTTP `201` with the new contact in `data`. New contacts default to not opted in. Setting `optedIn: true` is an assertion by the integrating system, so only send it when the evidence is accurate and can be produced if requested. Wavo also checks workspace suppression records and plan contact limits.

## 7. Update a contact

`PATCH /contacts/{contactId}`

Only `name` and `tags` may be changed through this endpoint. Phone number and consent status cannot be modified here. Use the workspace's consent workflow to record new consent or an opt-out.

Example:

```bash
curl -X PATCH "https://YOUR_WAVO_DOMAIN/api/v1/contacts/66a000000000000000000001" \
  -H "Authorization: Bearer $WAVO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Samira A.","tags":["customer","priority"]}'
```

The contact ID must belong to the API key's workspace. A contact from another workspace is returned as `404`, not exposed.

## 8. Send an approved WhatsApp template

`POST /messages/template`

Requires the `messages:send` permission. Sends one approved template using the workspace’s active connected WhatsApp number.

The recipient must already exist as a contact in the API key’s workspace, have `optIn.status: true`, and not be present in the active suppression list. Adding a contact does not grant consent. Wavo checks the current template status and language with Meta before sending and enforces the workspace’s monthly outbound-message allowance.

Request fields:

- `contactId`: existing Wavo contact ID.
- `templateName`: approved Meta template name (lowercase letters, numbers, underscores).
- `language`: exact template language code, such as `en_US`.
- `parameters`: optional ordered array of BODY text values matching the template’s positional variables.

Every send request must include a unique `Idempotency-Key` header (8–128 allowed characters). Repeating the same key with the same request replays the original result instead of sending again. Reusing a key with different request data returns `409`. Keys are retained for 24 hours; use a new key for a genuinely new send.

Example:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/messages/template" \
  -H "Authorization: Bearer $WAVO_API_KEY" \
  -H "Idempotency-Key: order-123-update-1" \
  -H "Content-Type: application/json" \
  -d '{
    "contactId": "66a000000000000000000001",
    "templateName": "order_update",
    "language": "en_US",
    "parameters": ["12345"]
  }'
```

A successful request returns HTTP `202` when Meta accepts the message. The response includes a `messageId` for correlating later delivery updates; acceptance is not delivery.

This first version supports approved templates with positional BODY text variables and static text headers. Named parameters, media or variable headers, limited-time-offer and copy-code templates are not supported. If a send request times out after quota reservation, the result is treated as unknown and the reservation is retained because Meta may have accepted the message. The idempotency key is locked to that unknown result; check message status before attempting a new send.

## 9. Check a message’s delivery status

`GET /messages/status?messageId={whatsappMessageId}`

Requires the `messages:read` permission. Use the `messageId` returned by a successful template-send request. The lookup is restricted to the API key’s workspace and does not reveal the recipient’s phone number.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/messages/status?messageId=wamid.HBgM..." \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

The response reports the latest status recorded by Wavo. Typical states are `accepted`, `sent`, `delivered`, `read`, and `failed`. Meta acceptance is not proof of delivery; delivery and read states arrive later through WhatsApp webhooks.

## 10. List message history

`GET /messages`

Requires the `messages:read` permission. Returns the latest messages in the API key’s workspace, newest first. Recipient phone numbers are not included.

Optional query parameters:

- `limit`: 1–100 records, default `50`.
- `direction`: `inbound` or `outbound`.
- `status`: `received`, `accepted`, `sent`, `delivered`, `read`, or `failed`.
- `before`: the opaque `nextCursor` returned by the previous page.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/messages?limit=50&direction=outbound&status=delivered" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

Use the returned `pagination.nextCursor` as the `before` parameter to fetch the next page. The cursor uses a stable timestamp and message ID ordering, so messages with the same timestamp are not skipped between pages. Treat the cursor as opaque. Invalid or oversized cursors return HTTP `400`.

## 11. List WhatsApp templates

`GET /templates`

Requires the `templates:read` permission. Retrieves the template catalog from the workspace’s active connected WhatsApp Business Account. The response includes template name, language, approval status, category, parameter format, and supported component metadata.

Optional query parameters:

- `limit`: 1–100 records, default `100`.
- `status`: filter by a Meta template status such as `APPROVED`, `PENDING`, `REJECTED`, or `PAUSED`.
- `after`: the opaque `pagination.nextCursor` from the previous page.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/templates?status=APPROVED&limit=100" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

Use `pagination.nextCursor` as `after` to retrieve the next page. Only approved templates can be sent through `POST /messages/template`; the send endpoint re-verifies the template directly with Meta at send time.

## 12. Campaigns

### List campaigns

`GET /campaigns` requires `campaigns:read`. Optional parameters: `limit` (1–100, default 50), `status` (`draft`, `queued`, `scheduled`, `sending`, `paused`, `cancelled`, `completed`, or `completed_with_issues`), and `before` (the opaque `pagination.nextCursor` from the previous page). The response includes campaign metadata and aggregate progress, but no recipient phone numbers. Use `pagination.hasMore` and `pagination.nextCursor` to fetch the next page. Ordering uses `createdAt` and campaign ID as a stable tie-breaker, so campaigns with matching timestamps are not skipped. Treat cursors as opaque; invalid cursors return HTTP `400`.

Example — first page:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/campaigns?limit=50&status=completed" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

The response's `pagination` object contains `limit`, `returned`, `hasMore`, and `nextCursor`. For example:

```json
{
  "pagination": {
    "limit": 50,
    "returned": 50,
    "hasMore": true,
    "nextCursor": "OPAQUE_CURSOR_FROM_RESPONSE"
  }
}
```

Example — next page (keep the returned cursor unchanged):

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/campaigns?limit=50&status=completed&before=$WAVO_NEXT_CURSOR" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

When `hasMore` is false, `nextCursor` is `null`. If a status filter is used, keep it on every page request so the same filtered result set is traversed.

### Get a campaign

`GET /campaigns/{campaignId}` requires `campaigns:read`. It returns the campaign's configuration, lifecycle timestamps, aggregate progress, and recipient counts grouped by delivery status. Recipient phone numbers and individual recipient records are never returned. A campaign ID outside the API key's workspace is reported as `404 Campaign not found`.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/campaigns/CAMPAIGN_ID" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

The `recipientStatusCounts` object may contain counts such as `pending`, `accepted`, `sent`, `delivered`, `read`, `failed`, `skipped`, or `unknown`, depending on campaign progress.
### Create a campaign draft

`POST /campaigns` requires `campaigns:write`. It creates a frozen recipient snapshot and a draft only. It never queues or sends messages. Queueing and scheduling remain an explicit action in the Wavo dashboard, where current Meta template approval, template parameter format, and delivery settings are revalidated.

Request example:

```json
{
  "name": "November update",
  "audience": { "type": "tag", "tag": "customer" },
  "template": { "name": "monthly_update", "language": "en_US" },
  "bodyParameters": ["November", "Wavo"]
}
```

Supported audience types are `all`, `group` (with a workspace-owned `groupId`), and `tag` (with a tag string). Only contacts currently marked opted-in and not currently suppressed are included in the snapshot. The worker also rechecks live consent and suppression immediately before each send, so an opt-out after draft creation still prevents delivery. Campaign and estimated message plan limits are checked before the draft is created. Meta template approval is rechecked when an authorized workspace user queues the draft; creating a draft does not guarantee later approval.

A successful request returns HTTP `201` and a campaign ID. A draft is not a send authorization. Do not retry a timed-out create blindly; check `GET /campaigns` first to avoid duplicate drafts.

### Queue or schedule a campaign

`POST /campaigns/{campaignId}/queue` requires `campaigns:write` and an `Idempotency-Key` header (8–128 allowed characters). It accepts an empty JSON object to queue immediately, or `{"scheduledAt":"2026-11-10T15:00:00.000Z"}` to schedule in ISO 8601. Scheduled times must be at least two minutes and no more than one year ahead.

The endpoint only accepts a draft owned by the API key's workspace. It verifies the frozen recipient snapshot, rechecks the exact template and language against Meta for current approval, validates supported template format and parameter counts, and atomically changes the campaign to `queued` or `scheduled`. Reusing the same idempotency key and request replays the original response; reusing it with a different request returns `409`. A successful queue response means the campaign entered the delivery queue; it does not mean messages have already been sent. The worker continues to recheck each contact's live opt-in and suppression state immediately before delivery.

### Pause or resume a campaign

`POST /campaigns/{campaignId}/control` requires `campaigns:write`. Send exactly one action:

```json
{ "action": "pause" }
```

or:

```json
{ "action": "resume" }
```

Pause is accepted only while a campaign is `queued` or `sending`. The worker checks campaign state before claiming recipients; a message already in flight may still finish. Resume is accepted only for a `paused` campaign and only while its original WhatsApp account is connected. It returns the campaign to `queued`; it does not reset recipient outcomes or automatically resend accepted, failed, skipped, or unknown recipients. Repeating pause on an already paused campaign is safe and returns the current state. Other invalid state transitions return `409` with `CAMPAIGN_STATE_CONFLICT`.

Example:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/campaigns/CAMPAIGN_ID/control" \\
  -H "Authorization: Bearer $WAVO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"pause"}'
```



You can also cancel a campaign with:

```json
{ "action": "cancel" }
```

Cancellation is accepted for `draft`, `queued`, `scheduled`, `sending`, and `paused` campaigns. Repeating cancellation is safe. A recipient already being processed by the worker may finish, but the worker will not claim further recipients after observing the cancelled state. Existing recipient outcomes are preserved. Completed campaigns cannot be cancelled. The campaign list supports the `cancelled` status filter and returns `cancelledAt` and `cancelReason`.
\n## 13. Error responses

Errors use JSON with `success: false` and a human-readable `message`. Some errors include a stable `code`.

| HTTP status | Meaning | Suggested action |
| --- | --- | --- |
| `400` | Invalid JSON, fields, phone, tags, or unsupported update fields | Correct the request |
| `401` | Missing, invalid, revoked, or expired key | Check or rotate the API key |
| `403` | Key lacks the required scope | Create/replace key with the needed permission |
| `404` | Contact not found in this workspace | Verify the contact ID |
| `409` | Duplicate or suppressed contact | Check the existing contact and suppression status |
| `429` | API rate limit or workspace plan limit reached | Check `code`; for API rate limiting, wait for `Retry-After` |
| `500` | Unexpected contact creation failure | Retry cautiously; check for a duplicate before retrying |
| `503` | A required shared store or history index is temporarily unavailable | Retry with exponential backoff; avoid tight retry loops |

Known error codes include:

- `CONTACT_EXISTS`: a contact with the phone number already exists in the workspace.
- `CONTACT_SUPPRESSED`: the phone number is suppressed because of an opt-out.
- `PLAN_LIMIT_REACHED`: the workspace has reached its current contact allowance.

## 14. Integration recommendations

- Keep API keys on your backend, not in a public website or mobile app bundle.
- Request only the scopes you need and rotate/revoke exposed keys.
- Normalize phone numbers to international format before submitting them.
- Keep your own consent record and submit accurate evidence when recording opt-in.
- Never infer consent from a purchase, an existing contact record, or a prior conversation.
- Handle `429` using `Retry-After`; use exponential backoff for transient `503` responses.
- Treat network timeouts as ambiguous: check whether a contact was created before retrying a create request.

## Current scope

The current public v1 API includes webhook event discovery, contact listing, individual contact lookup, creation, limited updates, single-recipient approved template sending, message status lookup, paginated message history, WhatsApp template catalog retrieval, campaign draft creation, campaign listing, campaign queueing/scheduling, and campaign pause/resume/cancellation. It does not currently expose contact deletion, bulk import, or free-form message sending.


## 15. Webhook subscriptions

Create a webhook subscription with `POST /webhooks` and the `webhooks:write` permission. Provide an HTTPS endpoint and one or more event types. To discover the current catalog programmatically, call `GET /webhooks/events` with `webhooks:read`; it returns each event name, description, and whether it is a test-only event.

- `message.received`: a new inbound WhatsApp message has been saved.
- `message.status_updated`: an outbound message status has been updated by Meta.
- `campaign.created`: a campaign draft and recipient snapshot have been created.
- `campaign.queued`: a campaign has been queued or scheduled from the dashboard or public API.
- `campaign.paused`: a campaign has been manually paused from the dashboard or public API.
- `campaign.resumed`: a paused campaign has been manually returned to the queue.
- `campaign.cancelled`: a campaign has been cancelled through the public API.
- `campaign.completed`: campaign processing has finished, including campaigns completed with issues.

The catalog also includes `webhook.test`, which is generated only by the explicit test-delivery endpoint. It cannot be selected as a subscription filter and does not represent a real customer event.

Example:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/webhooks" \
  -H "Authorization: Bearer $WAVO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/wavo/events","events":["message.received","message.status_updated"]}'
```

The response includes a `whsec_` signing secret exactly once. Store it securely. Wavo encrypts the stored secret and never returns it from list or delivery-history endpoints. Only HTTPS endpoints on the standard port are accepted. Local addresses, IP-literal hosts, credentials in URLs, and non-HTTPS URLs are rejected; delivery also resolves the hostname and refuses non-public IP addresses.

Every delivery is a JSON POST. Headers include `X-Wavo-Event` (event type), `X-Wavo-Delivery` (stable event ID), `X-Wavo-Timestamp` (Unix seconds), and `X-Wavo-Signature` (`sha256=` followed by a hex HMAC-SHA256). The signed message is the exact UTF-8 request body prefixed by the timestamp and a period:

```text
HMAC_SHA256(signing_secret, timestamp + "." + raw_request_body)
```

Verify the signature against the unmodified raw body using a constant-time comparison. Reject timestamps outside your chosen replay window (five minutes is a sensible default). Each event includes an `id`, `type`, `createdAt`, and `data`. Event IDs are stable across retries; use them for idempotency.

Wavo retries non-2xx responses and transport failures with exponential backoff, up to 10 attempts. A delivery is marked failed after the final attempt. A slow endpoint may time out after 10 seconds. Return a 2xx response quickly and process work asynchronously.

- `GET /webhooks` lists subscriptions.
- `DELETE /webhooks/{subscriptionId}` disables a subscription and cancels pending deliveries.
- `POST /webhooks/{subscriptionId}/test` queues a signed `webhook.test` event for that active subscription. It requires `webhooks:write`, does not require the subscription to include a particular event filter, and does not represent a real customer message or campaign event. The response is `202` with a delivery ID; inspect delivery history for the result.

Example:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/webhooks/SUBSCRIPTION_ID/test" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

- `POST /webhooks/{subscriptionId}/rotate-secret` rotates the signing secret for an active subscription. Requires `webhooks:write`. The new `whsec_` secret is returned exactly once; the previous secret becomes invalid immediately. Update your receiver's secret before relying on subsequent deliveries.

Example:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/webhooks/SUBSCRIPTION_ID/rotate-secret" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

- `GET /webhooks/{subscriptionId}/deliveries?limit=50` returns recent delivery attempts (maximum 100). Use `before` with the opaque `pagination.nextCursor` to fetch the next page. Pages use stable `createdAt` and delivery ID ordering, so records with matching timestamps are not skipped. Invalid limits or cursors return `400`.
- `POST /webhooks/{subscriptionId}/deliveries/{deliveryId}/retry` manually requeues a terminally failed delivery. Requires `webhooks:write` and an active subscription. Only a delivery in `failed` state can be retried; pending, processing, retrying, delivered, or cancelled deliveries are not reset. The retry starts a fresh automatic attempt budget while preserving a `manualRetries` counter. Repeated or concurrent retry requests are safe: only one can transition the failed delivery.

Example:

```bash
curl -X POST "https://YOUR_WAVO_DOMAIN/api/v1/webhooks/SUBSCRIPTION_ID/deliveries/DELIVERY_ID/retry" \
  -H "Authorization: Bearer $WAVO_API_KEY"
```


A delivery-history response includes event type and ID, status, attempt count, response status, last error, and retry/delivery timestamps. It does not include the signing secret. The delivery worker is `GET /api/cron/webhook-delivery`; configure a scheduler to call it periodically with `Authorization: Bearer $CRON_SECRET`. Each run processes up to 20 due deliveries. The worker is not automatically scheduled by this API change.
