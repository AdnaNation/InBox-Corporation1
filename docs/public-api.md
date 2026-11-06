# Public API v1 — Contacts

The public API lets an external system manage contacts inside one Wavo workspace. Every request is authenticated with a workspace-scoped API key. All endpoints use JSON over HTTPS.

> Base URL: `https://YOUR_WAVO_DOMAIN/api/v1`

## 1. Create an API key

In Wavo, open **Dashboard → API Keys** and create a key with only the permissions your integration needs. Copy the secret when it is shown; store it in a server-side secret manager and never commit it or expose it in browser JavaScript.

API keys use the `ibx_live_` prefix. The API stores a hash, not the raw key. Revoke a key immediately if it is exposed.

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
    "returned": 1
  }
}
```

The `optedIn` field reflects the workspace's recorded consent status. A contact being present in the address book does not mean it is eligible for marketing messages.

## 5. Create a contact

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

## 6. Update a contact

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

## 7. Send an approved WhatsApp template

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

## 8. Check a message’s delivery status

`GET /messages/status?messageId={whatsappMessageId}`

Requires the `messages:read` permission. Use the `messageId` returned by a successful template-send request. The lookup is restricted to the API key’s workspace and does not reveal the recipient’s phone number.

Example:

```bash
curl "https://YOUR_WAVO_DOMAIN/api/v1/messages/status?messageId=wamid.HBgM..." \
  -H "Authorization: Bearer $WAVO_API_KEY"
```

The response reports the latest status recorded by Wavo. Typical states are `accepted`, `sent`, `delivered`, `read`, and `failed`. Meta acceptance is not proof of delivery; delivery and read states arrive later through WhatsApp webhooks.

## 9. List message history

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

Use the returned `pagination.nextCursor` as the `before` parameter to fetch the next page. The cursor uses a stable timestamp and message ID ordering, so messages with the same timestamp are not skipped between pages. Treat the cursor as opaque.

## 10. Error responses

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
| `503` | Rate-limit storage unavailable | Retry with exponential backoff |

Known error codes include:

- `CONTACT_EXISTS`: a contact with the phone number already exists in the workspace.
- `CONTACT_SUPPRESSED`: the phone number is suppressed because of an opt-out.
- `PLAN_LIMIT_REACHED`: the workspace has reached its current contact allowance.

## 11. Integration recommendations

- Keep API keys on your backend, not in a public website or mobile app bundle.
- Request only the scopes you need and rotate/revoke exposed keys.
- Normalize phone numbers to international format before submitting them.
- Keep your own consent record and submit accurate evidence when recording opt-in.
- Never infer consent from a purchase, an existing contact record, or a prior conversation.
- Handle `429` using `Retry-After`; use exponential backoff for transient `503` responses.
- Treat network timeouts as ambiguous: check whether a contact was created before retrying a create request.

## Current scope

The current public v1 API includes contact listing, creation, limited updates, single-recipient approved template sending, message status lookup, and paginated message history. It does not currently expose contact deletion, bulk import, campaign creation, free-form message sending, or webhook subscription endpoints.
