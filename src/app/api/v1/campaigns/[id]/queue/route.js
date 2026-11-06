import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { decryptSecret } from "@/lib/crypto";
import { enqueueWebhookEvent } from "@/lib/public-webhooks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let idempotencyIndexPromise;
async function ensureIdempotencyIndex(db) {
  if (!idempotencyIndexPromise) {
    idempotencyIndexPromise = db.collection("apiRequestIdempotency")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "api_request_idempotency_ttl" })
      .catch((error) => { idempotencyIndexPromise = null; throw error; });
  }
  await idempotencyIndexPromise;
}

function respond(message, status, extra = {}, headers) {
  return NextResponse.json({ success: false, message, ...extra }, { status, headers });
}

function bodyVariableCount(template) {
  const body = template.components?.find((component) => component.type === "BODY");
  const numbers = [...new Set([...(body?.text || "").matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
  if (numbers.some((number, index) => number !== index + 1)) return null;
  return numbers.length;
}

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "campaigns:write");
  if (auth.error) return respond(auth.error, auth.status, {}, auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined);

  const { id } = await params;
  if (!ObjectId.isValid(id)) return respond("Invalid campaign ID.", 400);
  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return respond("Provide an Idempotency-Key header containing 8–128 letters, numbers, dots, underscores, colons, or hyphens.", 400, { code: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  let body;
  try { body = await request.json(); } catch { return respond("Invalid JSON request body.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return respond("Request body must be a JSON object.", 400);
  const unknownFields = Object.keys(body).filter((key) => key !== "scheduledAt");
  if (unknownFields.length) return respond("Only scheduledAt is supported in this request.", 400);

  let scheduledAt = null;
  if (body.scheduledAt !== undefined && body.scheduledAt !== null && body.scheduledAt !== "") {
    if (typeof body.scheduledAt !== "string") return respond("scheduledAt must be an ISO 8601 date-time string.", 400);
    scheduledAt = new Date(body.scheduledAt);
    const now = Date.now();
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < now + 2 * 60 * 1000 || scheduledAt.getTime() > now + 365 * 24 * 60 * 60 * 1000) {
      return respond("Choose a schedule at least 2 minutes and no more than 1 year in the future.", 400);
    }
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const campaignId = new ObjectId(id);
  const idemId = auth.apiKey._id.toString() + ":campaign-queue:" + createHash("sha256").update(idempotencyKey).digest("hex");
  const requestHash = createHash("sha256").update(JSON.stringify([id, scheduledAt?.toISOString() || null])).digest("hex");
  const idem = db.collection("apiRequestIdempotency");
  try {
    await ensureIdempotencyIndex(db);
    await idem.insertOne({ _id: idemId, apiKeyId: auth.apiKey._id, requestHash, status: "processing", createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  } catch (error) {
    if (error?.code !== 11000) {
      console.error("Campaign queue idempotency store unavailable:", error);
      return respond("API temporarily unavailable. Please retry shortly.", 503, { code: "IDEMPOTENCY_STORE_UNAVAILABLE" });
    }
    const previous = await idem.findOne({ _id: idemId });
    if (!previous || previous.requestHash !== requestHash) return respond("This Idempotency-Key was already used for a different request.", 409, { code: "IDEMPOTENCY_KEY_REUSED" });
    if (previous.status === "completed" && previous.responseBody) return NextResponse.json(previous.responseBody, { status: previous.responseStatus || 200 });
    if (previous.status === "unknown") return respond("The original queue outcome is unknown. Check campaign status before retrying.", 409, { code: "CAMPAIGN_QUEUE_OUTCOME_UNKNOWN" });
    return respond("A request with this Idempotency-Key is already being processed.", 409, { code: "REQUEST_IN_PROGRESS" }, { "Retry-After": "3" });
  }

  const fail = async (message, status, extra = {}) => {
    const responseBody = { success: false, message, ...extra };
    await idem.updateOne({ _id: idemId }, { $set: { status: "completed", responseStatus: status, responseBody, updatedAt: new Date() } });
    return NextResponse.json(responseBody, { status });
  };

  try {
    const campaign = await db.collection("campaigns").findOne({ _id: campaignId, workspaceId, status: "draft" });
    if (!campaign) return await fail("Draft campaign not found or already queued.", 404);
    const recipientCount = await db.collection("campaignRecipients").countDocuments({ workspaceId, campaignId });
    if (!recipientCount || recipientCount !== campaign.recipientCount) return await fail("Recipient snapshot is incomplete. This campaign cannot be queued.", 409);
    const parameters = campaign.bodyParameters || [];
    if (!Array.isArray(parameters) || !parameters.every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 1024)) {
      return await fail("Complete every template body parameter before queueing.", 400);
    }

    const account = await getActiveWhatsAppAccount(db, workspaceId);
    if (!account?.wabaId || !account?.phoneNumberId || !account?.accessTokenEncrypted) return await fail("A connected WhatsApp account is required.", 409, { code: "WHATSAPP_NOT_CONNECTED" });
    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v26.0";
    const url = new URL("https://graph.facebook.com/" + version + "/" + account.wabaId + "/message_templates");
    url.searchParams.set("name", campaign.template?.name || "");
    url.searchParams.set("fields", "id,name,status,language,components,parameter_format,category");
    url.searchParams.set("limit", "100");

    let metaResponse;
    let metaData;
    try {
      metaResponse = await fetch(url, { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
      metaData = await metaResponse.json();
    } catch {
      await idem.deleteOne({ _id: idemId });
      return respond("Could not reach Meta to verify the campaign template. Retry with the same Idempotency-Key.", 502, { code: "META_TEMPLATE_LOOKUP_FAILED" });
    }
    if (!metaResponse.ok) {
      await idem.deleteOne({ _id: idemId });
      return respond(metaData?.error?.message || "Meta template verification failed.", 502, { code: "META_TEMPLATE_LOOKUP_FAILED", metaErrorCode: metaData?.error?.code || null });
    }

    const template = (metaData.data || []).find((item) => item.name === campaign.template?.name && item.language === campaign.template?.language);
    if (!template || String(template.status || "").toUpperCase() !== "APPROVED") return await fail("The exact template and language must currently be approved by Meta.", 409, { code: "TEMPLATE_NOT_APPROVED" });
    if (String(template.parameter_format || "").toUpperCase() === "NAMED") return await fail("Named-parameter templates are not supported by campaign delivery yet.", 409);
    const components = template.components || [];
    const header = components.find((item) => item.type === "HEADER");
    if (header && (header.format !== "TEXT" || /\{\{\d+\}\}/.test(header.text || ""))) return await fail("Only static text headers are supported for campaign delivery.", 409);
    if (String(template.category || "").toUpperCase() === "AUTHENTICATION") return await fail("Authentication templates are not supported for campaigns.", 409);
    const variableCount = bodyVariableCount(template);
    if (variableCount === null || variableCount !== parameters.length) return await fail("Meta's current template requires " + (variableCount ?? "a valid number of") + " body parameter(s); this draft has " + parameters.length + ".", 409);
    const buttons = components.find((item) => item.type === "BUTTONS")?.buttons || [];
    const copyCodeButtonIndex = buttons.findIndex((button) => String(button.type || "").toUpperCase() === "COPY_CODE");
    const hasCopyCode = copyCodeButtonIndex >= 0;
    const limitedOffer = components.some((item) => item.type === "LIMITED_TIME_OFFER");
    const urlButtonIndex = buttons.findIndex((button) => String(button.type || "").toUpperCase() === "URL");
    if (hasCopyCode && String(template.category || "").toUpperCase() !== "MARKETING") return await fail("Copy-code templates must be approved as Marketing templates.", 409);
    if (limitedOffer && (!hasCopyCode || urlButtonIndex < 0 || String(template.category || "").toUpperCase() !== "MARKETING")) return await fail("Limited-time offers require a Marketing template with Copy code and Website URL buttons.", 409);
    const couponLimit = limitedOffer ? 15 : 20;
    if (hasCopyCode && (!/^[A-Za-z0-9_-]{1,20}$/.test(campaign.couponCode || "") || campaign.couponCode.length > couponLimit)) return await fail("This template needs a valid campaign coupon code of up to " + couponLimit + " characters.", 400);
    if (!hasCopyCode && campaign.couponCode) return await fail("The selected template has no copy-code button, but this campaign contains a coupon code.", 409);
    if (limitedOffer && (!Number.isInteger(campaign.offerDurationHours) || campaign.offerDurationHours < 1 || campaign.offerDurationHours > 168)) return await fail("Choose an offer validity between 1 hour and 7 days.", 400);

    const now = new Date();
    const result = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: "draft", recipientCount },
      { $set: {
        status: scheduledAt ? "scheduled" : "queued",
        ...(scheduledAt ? { scheduledAt } : {}),
        phoneNumberId: account.phoneNumberId,
        templateVerification: "approved",
        templateVerificationMessage: "Rechecked and approved by Meta during API queue preparation.",
        template: {
          ...campaign.template, id: template.id || null, status: "APPROVED",
          category: template.category || null, parameterFormat: template.parameter_format || null,
          bodyVariableCount: variableCount, hasCopyCode, isLimitedTimeOffer: limitedOffer,
          copyCodeButtonIndex: hasCopyCode ? copyCodeButtonIndex : null,
        },
        queuedAt: scheduledAt || now,
        queuedByApiKeyId: auth.apiKey._id,
        updatedAt: now,
        queueVersion: 1,
      } },
    );
    if (!result.modifiedCount) return await fail("Campaign state changed. Refresh and try again.", 409);
    try {
      await enqueueWebhookEvent(db, workspaceId, "campaign.queued", {
        campaignId: id, name: campaign.name, status: scheduledAt ? "scheduled" : "queued",
        recipientCount, scheduledAt: scheduledAt?.toISOString() || null, queuedAt: now.toISOString(),
      }, "campaign-" + id + "-queued-" + String(now.getTime()));
    } catch (eventError) {
      console.error("Campaign queued webhook enqueue failed:", eventError);
    }

    const responseBody = {
      success: true,
      message: scheduledAt ? "Campaign validated and scheduled. It will enter the delivery queue at the selected time." : "Campaign validated and queued. No messages have been sent yet.",
      data: { campaignId: id, recipientCount, status: scheduledAt ? "scheduled" : "queued", scheduledAt },
    };
    await idem.updateOne({ _id: idemId }, { $set: { status: "completed", responseStatus: 200, responseBody, updatedAt: new Date() } });
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Public API campaign queue error:", error);
    await idem.updateOne({ _id: idemId }, { $set: { status: "unknown", updatedAt: new Date() } }).catch(() => {});
    return respond("Campaign queue outcome is unknown. Check campaign status before retrying.", 500, { code: "CAMPAIGN_QUEUE_OUTCOME_UNKNOWN" });
  }
}
