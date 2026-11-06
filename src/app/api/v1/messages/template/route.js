import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { decryptSecret } from "@/lib/crypto";
import { reserveWorkspaceMessageUsage, releaseWorkspaceMessageUsage } from "@/lib/plan-limits";
import { applyPendingWhatsAppStatus } from "@/lib/whatsapp-status";

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

  const suppression = await db.collection("contactSuppressions").findOne({
    workspaceId, phone: contact.phone, active: { $ne: false },
  }, { projection: { _id: 1 } });
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

  const components = expectedVariables > 0
    ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }]
    : [];
  const quota = await reserveWorkspaceMessageUsage(db, workspaceId, 1);
  if (!quota.allowed) return errorResponse(quota.reason, 429, {
    code: "PLAN_LIMIT_REACHED", plan: quota.plan, usage: quota.usage, limits: quota.limits,
  });

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
    return errorResponse("The send outcome is unknown because Meta could not be reached. Check message status before retrying.", 502, { code: "MESSAGE_SEND_OUTCOME_UNKNOWN" });
  }

  if (!metaResponse.ok) {
    await releaseWorkspaceMessageUsage(db, workspaceId, 1);
    return errorResponse(metaData?.error?.message || "Meta rejected the WhatsApp message.", 502, {
      code: "META_MESSAGE_REJECTED", metaErrorCode: metaData?.error?.code || null,
    });
  }

  const waMessageId = metaData?.messages?.[0]?.id;
  if (!waMessageId) return errorResponse("Meta accepted the request but did not return a message ID. Check message status before retrying.", 502, { code: "MESSAGE_SEND_OUTCOME_UNKNOWN" });

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

  await db.collection("messages").updateOne(
    { workspaceId, waMessageId }, { $setOnInsert: messageDocument }, { upsert: true },
  );
  await applyPendingWhatsAppStatus(db, workspaceId, waMessageId);

  return NextResponse.json({
    success: true,
    message: "Message accepted by Meta.",
    data: {
      messageId: waMessageId, contactId, phoneNumberId: account.phoneNumberId,
      template: { name: template.name, language: template.language },
      status: "accepted", acceptedAt: now,
    },
  }, { status: 202 });
}
