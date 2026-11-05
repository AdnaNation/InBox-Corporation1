import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";
import { applyPendingWhatsAppStatus } from "@/lib/whatsapp-status";
import { reserveWorkspaceMessageUsage, releaseWorkspaceMessageUsage } from "@/lib/plan-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid origin." },
      { status: 403 },
    );
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const {
      contactId,
      templateName,
      language,
      parameters = [],
      couponCode,
      expirationTime,
    } = body;

    if (
      typeof contactId !== "string" ||
      !ObjectId.isValid(contactId) ||
      typeof templateName !== "string" ||
      !/^[a-zA-Z0-9_]+$/.test(templateName) ||
      typeof language !== "string" ||
      !/^[a-zA-Z0-9_-]+$/.test(language) ||
      !Array.isArray(parameters) ||
      parameters.length > 20 ||
      !parameters.every(
        (value) => typeof value === "string" && value.length <= 1024,
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid message details." },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);

    const [contact, account] = await Promise.all([
      db.collection("contacts").findOne({
        _id: new ObjectId(contactId),
        workspaceId,
        "optIn.status": true,
      }),
      db.collection("whatsappAccounts").findOne({
        workspaceId,
        status: "connected",
      }),
    ]);

    if (!contact) {
      return NextResponse.json(
        { success: false, message: "Opted-in contact not found." },
        { status: 404 },
      );
    }

    if (!account) {
      return NextResponse.json(
        { success: false, message: "WhatsApp account is not connected." },
        { status: 400 },
      );
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v22.0";

    // Never trust the browser's template status. Re-check the exact
    // template name and language against this workspace's connected WABA.
    const templatesUrl = new URL(
      `https://graph.facebook.com/${version}/${account.wabaId}/message_templates`,
    );
    templatesUrl.searchParams.set("name", templateName);
    templatesUrl.searchParams.set(
      "fields",
      "id,name,status,language,components,parameter_format",
    );
    templatesUrl.searchParams.set("limit", "100");

    const templatesResponse = await fetch(templatesUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const templatesData = await templatesResponse.json();

    if (!templatesResponse.ok) {
      console.error("Meta template lookup error:", templatesData);
      return NextResponse.json(
        {
          success: false,
          message:
            templatesData?.error?.message ||
            "Could not verify the template with Meta.",
        },
        { status: 502 },
      );
    }

    const matchedTemplate = (templatesData.data || []).find(
      (item) => item.name === templateName && item.language === language,
    );

    if (!matchedTemplate) {
      return NextResponse.json(
        {
          success: false,
          message:
            "This template and language were not found in your connected WhatsApp account.",
        },
        { status: 400 },
      );
    }

    if (String(matchedTemplate.status).toUpperCase() !== "APPROVED") {
      return NextResponse.json(
        {
          success: false,
          message: `This template is ${String(matchedTemplate.status || "unavailable").toLowerCase()} and cannot be sent.`,
        },
        { status: 409 },
      );
    }

    const templateButtons = matchedTemplate.components?.find((component) => component.type === "BUTTONS")?.buttons || [];
    const copyCodeButtonIndex = templateButtons.findIndex((button) => String(button.type || "").toUpperCase() === "COPY_CODE");
    const hasCopyCode = copyCodeButtonIndex >= 0;
    const isLimitedTimeOffer = (matchedTemplate.components || []).some((component) => component.type === "LIMITED_TIME_OFFER");
    const couponLimit = isLimitedTimeOffer ? 15 : 20;
    const urlButtonIndex = templateButtons.findIndex((button) => String(button.type || "").toUpperCase() === "URL");
    if (isLimitedTimeOffer && (!hasCopyCode || urlButtonIndex < 0 || String(matchedTemplate.category || "").toUpperCase() !== "MARKETING")) {
      return NextResponse.json({ success: false, message: "This limited-time offer must be a Marketing template with both Copy code and Website URL buttons." }, { status: 409 });
    }
    if (hasCopyCode && (typeof couponCode !== "string" || !/^[A-Za-z0-9_-]{1,20}$/.test(couponCode.trim()) || couponCode.trim().length > couponLimit)) {
      return NextResponse.json({ success: false, message: `Enter a valid coupon code of up to ${couponLimit} characters.` }, { status: 400 });
    }
    if (!hasCopyCode && couponCode) {
      return NextResponse.json({ success: false, message: "This template does not contain a copy-code button." }, { status: 400 });
    }
    let expirationTimeMs = null;
    if (isLimitedTimeOffer) {
      const expiry = typeof expirationTime === "string" ? new Date(expirationTime) : null;
      if (!expiry || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        return NextResponse.json({ success: false, message: "Choose an offer expiry in the future." }, { status: 400 });
      }
      expirationTimeMs = expiry.getTime();
    }

    const bodyComponent = (matchedTemplate.components || []).find(
      (component) => component.type === "BODY",
    );
    const expectedVariables = [
      ...new Set((bodyComponent?.text || "").match(/\{\{\d+\}\}/g) || []),
    ].length;

    if (parameters.length !== expectedVariables) {
      return NextResponse.json(
        {
          success: false,
          message: `This template requires ${expectedVariables} body parameter(s), but ${parameters.length} were provided.`,
        },
        { status: 400 },
      );
    }

    const components = [];
    if (expectedVariables) {
      components.push({ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) });
    }
    if (isLimitedTimeOffer) {
      components.push({ type: "limited_time_offer", parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: expirationTimeMs } }] });
    }
    if (hasCopyCode) {
      components.push({ type: "button", sub_type: "copy_code", index: copyCodeButtonIndex, parameters: [{ type: "coupon_code", coupon_code: couponCode.trim() }] });
    }

    const quota = await reserveWorkspaceMessageUsage(db, workspaceId, 1);
    if (!quota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: quota.reason, plan: quota.plan, usage: quota.usage, limits: quota.limits }, { status: 429 });
    }

    const response = await fetch(
      `https://graph.facebook.com/${version}/${account.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: contact.phone.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            ...(components.length ? { components } : {}),
          },
        }),
        cache: "no-store",
      },
    );

    const data = await response.json();
    const now = new Date();
    const waMessageId = data.messages?.[0]?.id || null;

    const messageDocument = {
      workspaceId,
      contactId: contact._id,
      phoneNumberId: account.phoneNumberId,
      waId: contact.phone.replace(/^\\+/, ""),
      waMessageId,
      providerMessageId: waMessageId,
      direction: "outbound",
      type: "template",
      templateName,
      templateLanguage: language,
      ...(hasCopyCode ? { templateCouponCode: couponCode.trim() } : {}),
      ...(isLimitedTimeOffer ? { templateOfferExpiresAt: new Date(expirationTimeMs) } : {}),
      status: response.ok ? "accepted" : "failed",
      statusRank: 0,
      error: response.ok ? null : data.error?.message || "Meta API error",
      timestamp: now,
      createdAt: now,
      updatedAt: now,
    };

    if (waMessageId) {
      await db.collection("messages").updateOne(
        { workspaceId, waMessageId },
        { $setOnInsert: messageDocument },
        { upsert: true },
      );

      // A webhook can arrive before the send request finishes saving its
      // message. Apply and clear that queued delivery event after insertion.
      await applyPendingWhatsAppStatus(db, workspaceId, waMessageId);
    } else {
      await db.collection("messages").insertOne(messageDocument);
    }

    if (!response.ok) {
      await releaseWorkspaceMessageUsage(db, workspaceId, 1);
      return NextResponse.json(
        {
          success: false,
          message: data.error?.message || "Meta rejected the message.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Message accepted by Meta.",
      messageId: data.messages?.[0]?.id,
    });
  } catch (error) {
    console.error("Template send error:", error);
    return NextResponse.json(
      { success: false, message: "Could not send the message." },
      { status: 500 },
    );
  }
}
