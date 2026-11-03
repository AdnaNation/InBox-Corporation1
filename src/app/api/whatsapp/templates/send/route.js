import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";
import { applyPendingWhatsAppStatus } from "@/lib/whatsapp-status";

export const runtime = "nodejs";

function getBodyVariableCount(template) {
  const body = template.components?.find(
    (component) => component.type === "BODY",
  );

  if (!body?.text) return 0;

  const matches = [...body.text.matchAll(/\{\{(\d+)\}\}/g)];
  const numbers = matches.map((match) => Number(match[1]));

  if (numbers.length === 0) return 0;

  // This implementation supports positional variables: {{1}}, {{2}}, etc.
  const uniqueNumbers = [...new Set(numbers)].sort((a, b) => a - b);

  if (uniqueNumbers.some((number, index) => number !== index + 1)) {
    throw new Error("This template has unsupported variable numbering.");
  }

  return uniqueNumbers.length;
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid request origin." },
      { status: 403 },
    );
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const { conversationId, templateName, language, parameters } = body;

    if (
      typeof conversationId !== "string" ||
      !ObjectId.isValid(conversationId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid conversation." },
        { status: 400 },
      );
    }

    if (
      typeof templateName !== "string" ||
      !/^[a-z0-9_]{1,512}$/.test(templateName) ||
      typeof language !== "string" ||
      !/^[a-zA-Z0-9_-]{2,35}$/.test(language) ||
      !Array.isArray(parameters) ||
      parameters.length > 20 ||
      !parameters.every(
        (value) => typeof value === "string" && value.length <= 1024,
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid template details." },
        { status: 400 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();

    const conversation = await db.collection("conversations").findOne({
      _id: new ObjectId(conversationId),
      workspaceId,
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, message: "Conversation not found." },
        { status: 404 },
      );
    }

    const account = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      phoneNumberId: conversation.phoneNumberId,
      status: "connected",
    });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Connected WhatsApp account not found." },
        { status: 404 },
      );
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v22.0";

    // Verify the selected template against Meta's current template data.
    const templateUrl = new URL(
      `https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates`,
    );

    templateUrl.searchParams.set(
      "fields",
      "id,name,status,language,category,components,parameter_format",
    );
    templateUrl.searchParams.set("name", templateName);
    templateUrl.searchParams.set("limit", "100");

    const templateResponse = await fetch(templateUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const templateResult = await templateResponse.json();

    if (!templateResponse.ok) {
      console.error("Meta template verification error:", templateResult);

      return NextResponse.json(
        {
          success: false,
          message:
            templateResult?.error?.message ||
            "Could not verify the WhatsApp template.",
        },
        { status: 502 },
      );
    }

    const template = (templateResult.data || []).find(
      (item) => item.name === templateName && item.language === language,
    );

    if (!template) {
      return NextResponse.json(
        {
          success: false,
          message: "Template not found in this WhatsApp account.",
        },
        { status: 404 },
      );
    }

    if (template.status !== "APPROVED") {
      return NextResponse.json(
        {
          success: false,
          message: `This template is ${template.status}. Only approved templates can be sent.`,
        },
        { status: 400 },
      );
    }

    if (template.parameter_format === "named") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Named-parameter templates are not supported by this first version.",
        },
        { status: 400 },
      );
    }

    const unsupportedComponents = (template.components || []).filter(
      (component) =>
        component.type === "HEADER" &&
        (component.format !== "TEXT" ||
          /\{\{\d+\}\}/.test(component.text || "")),
    );

    if (unsupportedComponents.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This version supports text BODY variables only. Media or variable HEADER templates are not supported yet.",
        },
        { status: 400 },
      );
    }

    const bodyVariableCount = getBodyVariableCount(template);

    if (parameters.length !== bodyVariableCount) {
      return NextResponse.json(
        {
          success: false,
          message: `This template requires ${bodyVariableCount} body variable(s). You provided ${parameters.length}.`,
        },
        { status: 400 },
      );
    }

    const components = [];

    if (bodyVariableCount > 0) {
      components.push({
        type: "body",
        parameters: parameters.map((value) => ({
          type: "text",
          text: value,
        })),
      });
    }

    const metaResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${account.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: conversation.waId,
          type: "template",
          template: {
            name: template.name,
            language: {
              code: template.language,
            },
            ...(components.length > 0 ? { components } : {}),
          },
        }),
        cache: "no-store",
      },
    );

    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta template send error:", metaData);

      return NextResponse.json(
        {
          success: false,
          message:
            metaData?.error?.message || "Meta could not send this template.",
          errorCode: metaData?.error?.code || null,
        },
        { status: 502 },
      );
    }

    const waMessageId = metaData?.messages?.[0]?.id;

    if (!waMessageId) {
      return NextResponse.json(
        { success: false, message: "Meta did not return a message ID." },
        { status: 502 },
      );
    }

    const bodyText =
      template.components?.find((component) => component.type === "BODY")
        ?.text || "";

    let preview = bodyText;

    parameters.forEach((value, index) => {
      preview = preview.replaceAll(`{{${index + 1}}}`, value);
    });

    const now = new Date();

    const messageDocument = {
      workspaceId,
      conversationId: conversation._id,
      contactId: conversation.contactId,
      waMessageId,
      phoneNumberId: conversation.phoneNumberId,
      waId: conversation.waId,
      direction: "outbound",
      type: "template",
      templateName: template.name,
      templateLanguage: template.language,
      templateParameters: parameters,
      text: preview || `Template: ${template.name}`,
      status: "sent",
      statusRank: 1,
      timestamp: now,
      createdAt: now,
    };

    await db
      .collection("messages")
      .updateOne(
        { workspaceId, waMessageId },
        { $setOnInsert: messageDocument },
        { upsert: true },
      );

    await applyPendingWhatsAppStatus(db, workspaceId, waMessageId);

    await db.collection("conversations").updateOne(
      { _id: conversation._id, workspaceId },
      {
        $set: {
          lastMessageAt: now,
          lastMessagePreview: preview || `Template: ${template.name}`,
          updatedAt: now,
        },
      },
    );
    const savedMessage = await db.collection("messages").findOne({
      workspaceId,
      waMessageId,
    });

    return NextResponse.json({
      success: true,
      message: savedMessage || messageDocument,
    });
  } catch (error) {
    console.error("Send WhatsApp template error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Could not send WhatsApp template.",
      },
      { status: 500 },
    );
  }
}
