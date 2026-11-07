import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { ensureMongoIndex } from "@/lib/mongo-indexes.mjs";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { decryptSecret } from "@/lib/crypto";
import { reserveWorkspaceMessageUsage, releaseWorkspaceMessageUsage } from "@/lib/plan-limits";
import { applyPendingWhatsAppStatus } from "@/lib/whatsapp-status";
import { findActiveContactSuppression } from "@/lib/contact-suppression.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function errorResponse(message, status, extra = {}, headers) {
  return NextResponse.json({ success: false, message, ...extra }, { status, headers });
}

function getBodyVariableCount(template) {
  const body = template.components?.find((component) => component.type === "BODY");
  const matches = [...(body?.text || "").matchAll(/\{\{(\d+)\}\}/g)];
  const numbers = [...new Set(matches.map((match) => Number(match[1])))].sort((a, b) => a - b);
  if (numbers.some((number, index) => number !== index + 1)) return null;
  return numbers.length;
}

function validateSupportedTemplate(template) {
  if (String(template.parameter_format || "").toUpperCase() === "NAMED") return "Named-parameter templates are not supported yet.";
  const components = template.components || [];
  const header = components.find((component) => component.type === "HEADER");
  if (header && (header.format !== "TEXT" || /\{\{\d+\}\}/.test(header.text || ""))) {
    return "Only static text headers are supported. Media or variable headers cannot be sent through this endpoint.";
  }
  if (components.some((component) => component.type === "LIMITED_TIME_OFFER")) return "Limited-time offer templates are not supported by this API endpoint yet.";
  const buttons = components.find((component) => component.type === "BUTTONS")?.buttons || [];
  if (buttons.some((button) => String(button.type || "").toUpperCase() === "COPY_CODE")) return "Copy-code templates are not supported by this API endpoint yet.";
  if (buttons.some((button) => String(button.type || "").toUpperCase() === "URL" && /\\{\\{\\d+\\}\\}/.test(button.url || ""))) return "Dynamic URL button parameters are not supported by this API endpoint yet.";
  if (String(template.category || "").toUpperCase() === "AUTHENTICATION") return "Authentication templates are not supported by this API endpoint yet.";
  return null;
}

export async function POST(request) {
  const auth = await authenticateApiKey(request, "messages:send");
  if (auth.error) {
    return errorResponse(auth.error, auth.status, {}, auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON request body.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Request body must be a JSON object.", 400);
  const idempotencyKey = request.headers.get("idempotency-key") || "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return errorResponse("Provide an Idempotency-Key header containing 8–128 letters, numbers, dots, underscores, colons, or hyphens.", 400, { code: "IDEMPOTENCY_KEY_REQUIRED" });
  }

  const { contactId, templateName, language, parameters = [] } = body;
  if (
    typeof contactId !== "string" || !ObjectId.isValid(contactId) ||
    typeof templateName !== "string" || !/^[a-z0-9_]{1,512}$/.test(templateName) ||
    typeof language !== "string" || !/^[a-zA-Z0-9_-]{2,35}$/.test(language) ||
    !Array.isArray(parameters) || parameters.length > 20 ||
    !parameters.every((value) => typeof value === "string" && value.length <= 1024)
  ) {
    return errorResponse("Provide a valid contactId, templateName, language, and up to 20 text parameters.", 400);
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const contact = await db.collection("contacts").findOne({
    _id: new ObjectId(contactId), workspaceId, "optIn.status": true,
  });
  if (!contact) return errorResponse("An existing opted-in contact was not found in this workspace.", 404, { code: "OPTED_IN_CONTACT_NOT_FOUND" });

  const suppression = await findActiveContactSuppression(db, workspaceId, contact.phone);
  if (suppression) return errorResponse("This phone number is suppressed and cannot receive messages.", 409, { code: "CONTACT_SUPPRESSED" });

  const account = await getActiveWhatsAppAccount(db, workspaceId);
  if (!account?.accessTokenEncrypted || !account.wabaId || !account.phoneNumberId) {
    return errorResponse("No active connected WhatsApp account is available for this workspace.", 409, { code: "WHATSAPP_NOT_CONNECTED" });
  }

  const accessToken = decryptSecret(account.accessTokenEncrypted);
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
  const templatesUrl = new URL("https://graph.facebook.com/" + apiVersion + "/" + account.wabaId + "/message_templates");
  templatesUrl.searchParams.set("name", templateName);
  templatesUrl.searchParams.set("fields", "id,name,status,language,category,components,parameter_format");
  templatesUrl.searchParams.set("limit", "100");

  let templateResponse;
  let templateResult;
  try {
    templateResponse = await fetch(templatesUrl, { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
    templateResult = await templateResponse.json();
  } catch {
    return errorResponse("Could not reach Meta to verify the WhatsApp template.", 502, { code: "META_TEMPLATE_LOOKUP_FAILED" });
  }
  if (!templateResponse.ok) {
    return errorResponse(templateResult?.error?.message || "Meta could not verify the WhatsApp template.", 502, {
      code: "META_TEMPLATE_LOOKUP_FAILED", metaErrorCode: templateResult?.error?.code || null,
    });
  }

  const template = (templateResult.data || []).find((item) => item.name === templateName && item.language === language);
  if (!template) return errorResponse("The template and language were not found in the active WhatsApp account.", 404, { code: "TEMPLATE_NOT_FOUND" });
  if (String(template.status || "").toUpperCase() !== "APPROVED") {
    return errorResponse("Only approved WhatsApp templates can be sent.", 409, { code: "TEMPLATE_NOT_APPROVED", templateStatus: template.status || "UNKNOWN" });
  }

  const unsupportedReason = validateSupportedTemplate(template);
  if (unsupportedReason) return errorResponse(unsupportedReason, 400, { code: "UNSUPPORTED_TEMPLATE_FORMAT" });
  const expectedVariables = getBodyVariableCount(template);
  if (expectedVariables === null) return errorResponse("The template body uses unsupported variable numbering.", 400, { code: "INVALID_TEMPLATE_VARIABLES" });
  if (parameters.length !== expectedVariables) {
    return errorResponse("This template requires " + expectedVariables + " body parameter(s), but " + parameters.length + " were provided.", 400, {
      code: "TEMPLATE_PARAMETER_COUNT_MISMATCH", expected: expectedVariables,
    });
  }

  const idempotencyCollection = db.collection("apiRequestIdempotency");
  const idempotencyId = auth.apiKey._id.toString() + ":" + createHash("sha256").update(idempotencyKey).digest("hex");
  const requestHash = createHash("sha256").update(JSON.stringify([contactId, templateName, language, parameters])).digest("hex");
  try {
    await ensureMongoIndex(db, "apiRequestIdempotency", { expiresAt: 1 }, { expireAfterSeconds: 0, name: "api_request_idempotency_ttl" });
    await idempotencyCollection.insertOne({
      _id: idempotencyId,
      apiKeyId: auth.apiKey._id,
      requestHash,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } catch (error) {
    if (error?.code !== 11000) {
      console.error("Public API idempotency store unavailable:", error);
      return errorResponse("API temporarily unavailable. Please retry shortly.", 503, { code: "IDEMPOTENCY_STORE_UNAVAILABLE" });
    }
    const previous = await idempotencyCollection.findOne({ _id: idempotencyId });
    if (!previous || previous.requestHash !== requestHash) {
      return errorResponse("This Idempotency-Key was already used for a different request.", 409, { code: "IDEMPOTENCY_KEY_REUSED" });
    }
    if (previous.status === "completed" && previous.responseBody) {
      return NextResponse.json(previous.responseBody, { status: previous.responseStatus || 202 });
    }
    if (previous.status === "unknown") {
      return errorResponse("The original send outcome is unknown. Check WhatsApp message status before attempting another send with a new key.", 409, { code: "MESSAGE_SEND_OUTCOME_UNKNOWN" });
    }
    return errorResponse("A request with this Idempotency-Key is already being processed.", 409, { code: "REQUEST_IN_PROGRESS" }, { "Retry-After": "3" });
  }

  const components = expectedVariables > 0
    ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }]
    : [];
  const quota = await reserveWorkspaceMessageUsage(db, workspaceId, 1);
  if (!quota.allowed) {
    await idempotencyCollection.deleteOne({ _id: idempotencyId });
    return errorResponse(quota.reason, 429, {
      code: "PLAN_LIMIT_REACHED", plan: quota.plan, usage: quota.usage, limits: quota.limits,
    });
  }

  let latestSuppression;
  try {
    latestSuppression = await findActiveContactSuppression(db, workspaceId, contact.phone);
  } catch (error) {
    console.error("Public API suppression check failed:", error);
    await releaseWorkspaceMessageUsage(db, workspaceId, 1);
    await idempotencyCollection.deleteOne({ _id: idempotencyId });
    return errorResponse("Could not verify recipient opt-out status. Retry with the same Idempotency-Key.", 503, { code: "SUPPRESSION_CHECK_FAILED" });
  }
  if (latestSuppression) {
    await releaseWorkspaceMessageUsage(db, workspaceId, 1);
    await idempotencyCollection.deleteOne({ _id: idempotencyId });
    return errorResponse("This phone number is suppressed and cannot receive messages.", 409, { code: "CONTACT_SUPPRESSED" });
  }

  // A network timeout is ambiguous: keep the reservation because Meta may have accepted the message.
  let metaResponse;
  let metaData;
  try {
    metaResponse = await fetch("https://graph.facebook.com/" + apiVersion + "/" + account.phoneNumberId + "/messages", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: contact.phone.replace(/^\+/, ""),
        type: "template",
        template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) },
      }),
      cache: "no-store",
    });
    metaData = await metaResponse.json();
  } catch (error) {
    console.error("Public API WhatsApp send outcome is unknown:", error);
    const unknownBody = { success: false, message: "The send outcome is unknown because Meta could not be reached. Check message status before retrying.", code: "MESSAGE_SEND_OUTCOME_UNKNOWN" };
    await idempotencyCollection.updateOne({ _id: idempotencyId }, { $set: { status: "unknown", responseBody: unknownBody, updatedAt: new Date() } });
    return NextResponse.json(unknownBody, { status: 502 });
  }

  if (!metaResponse.ok) {
    await releaseWorkspaceMessageUsage(db, workspaceId, 1);
    const rejectedBody = { success: false, message: metaData?.error?.message || "Meta rejected the WhatsApp message.", code: "META_MESSAGE_REJECTED", metaErrorCode: metaData?.error?.code || null };
    await idempotencyCollection.updateOne({ _id: idempotencyId }, { $set: { status: "completed", responseStatus: 502, responseBody: rejectedBody, updatedAt: new Date() } });
    return NextResponse.json(rejectedBody, { status: 502 });
  }

  const waMessageId = metaData?.messages?.[0]?.id;
  if (!waMessageId) {
    const unknownBody = { success: false, message: "Meta accepted the request but did not return a message ID. Check message status before retrying.", code: "MESSAGE_SEND_OUTCOME_UNKNOWN" };
    await idempotencyCollection.updateOne({ _id: idempotencyId }, { $set: { status: "unknown", responseBody: unknownBody, updatedAt: new Date() } });
    return NextResponse.json(unknownBody, { status: 502 });
  }

  const now = new Date();
  const bodyText = template.components?.find((component) => component.type === "BODY")?.text || "";
  let preview = bodyText;
  parameters.forEach((value, index) => { preview = preview.replaceAll("{{" + (index + 1) + "}}", value); });
  const messageDocument = {
    workspaceId, contactId: contact._id, phoneNumberId: account.phoneNumberId,
    waId: contact.phone.replace(/^\+/, ""), waMessageId, providerMessageId: waMessageId,
    direction: "outbound", type: "template", templateName: template.name,
    templateLanguage: template.language, templateParameters: parameters,
    text: preview || "Template: " + template.name, status: "accepted", statusRank: 0,
    timestamp: now, createdAt: now, updatedAt: now,
  };

  const successBody = {
    success: true,
    message: "Message accepted by Meta.",
    data: {
      messageId: waMessageId, contactId, phoneNumberId: account.phoneNumberId,
      template: { name: template.name, language: template.language },
      status: "accepted", acceptedAt: now,
    },
  };
  try {
    await db.collection("messages").updateOne(
      { workspaceId, waMessageId }, { $setOnInsert: messageDocument }, { upsert: true },
    );
    await applyPendingWhatsAppStatus(db, workspaceId, waMessageId);
  } catch (error) {
    console.error("Meta accepted message but Wavo could not persist its record:", error);
    const unknownBody = { success: false, message: "Meta accepted the message, but Wavo could not finish saving its record. Do not retry with a new key; check message status.", code: "MESSAGE_ACCEPTED_PERSISTENCE_PENDING", messageId: waMessageId };
    await idempotencyCollection.updateOne({ _id: idempotencyId }, { $set: { status: "unknown", responseBody: unknownBody, updatedAt: new Date() } });
    return NextResponse.json(unknownBody, { status: 502 });
  }

  await idempotencyCollection.updateOne({ _id: idempotencyId }, { $set: { status: "completed", responseStatus: 202, responseBody: successBody, updatedAt: new Date() } });
  return NextResponse.json(successBody, { status: 202 });
}
