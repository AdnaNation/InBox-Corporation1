import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account) return NextResponse.json({ success: false, message: "Connect a WhatsApp account first." }, { status: 404 });

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates`);
    url.searchParams.set("fields", "id,name,status,language,category,components,parameter_format,quality_score,rejected_reason");
    url.searchParams.set("limit", "100");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      console.error("Meta template list error:", result);
      return NextResponse.json({ success: false, message: result?.error?.message || "Could not retrieve WhatsApp templates." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      templates: result.data || [],
      account: { displayPhoneNumber: account.displayPhoneNumber, businessName: account.businessName },
      hasMore: Boolean(result.paging?.next),
    });
  } catch (error) {
    console.error("Load WhatsApp templates error:", error);
    return NextResponse.json({ success: false, message: "Could not load templates." }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can edit templates." }, { status: 403 });
  try {
    const body = await request.json();
    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
    const components = body.components;
    if (!/^\d+$/.test(templateId)) return NextResponse.json({ success: false, message: "A valid Meta template ID is required." }, { status: 400 });
    const allowedTypes = ["HEADER", "BODY", "FOOTER", "BUTTONS", "LIMITED_TIME_OFFER", "CAROUSEL"];
    if (!Array.isArray(components) || components.length === 0 || components.length > 10 || components.some((item) => !item || typeof item !== "object" || Array.isArray(item) || !allowedTypes.includes(String(item.type || "").toUpperCase()))) return NextResponse.json({ success: false, message: "Provide the complete Meta components array, including every component you want to keep." }, { status: 400 });
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account?.accessTokenEncrypted || !account.wabaId) return NextResponse.json({ success: false, message: "Connect a WhatsApp Business Account first." }, { status: 404 });
    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const currentResponse = await fetch("https://graph.facebook.com/" + apiVersion + "/" + templateId + "?fields=id,status", {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store",
    });
    const currentTemplate = await currentResponse.json();
    if (!currentResponse.ok || currentTemplate.error) return NextResponse.json({ success: false, message: currentTemplate?.error?.message || "Could not verify this template with Meta." }, { status: 502 });
    if (!["APPROVED", "REJECTED", "PAUSED"].includes(String(currentTemplate.status || "").toUpperCase())) {
      return NextResponse.json({ success: false, message: "Meta only allows edits to approved, rejected, or paused templates. This template is currently " + (currentTemplate.status || "not editable") + "." }, { status: 409 });
    }
    const response = await fetch("https://graph.facebook.com/" + apiVersion + "/" + templateId, {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ components }),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || result.error || result.success === false) return NextResponse.json({ success: false, message: result?.error?.error_user_msg || result?.error?.message || "Meta could not update this template.", metaErrorCode: result?.error?.code || null, metaErrorSubcode: result?.error?.error_subcode || null }, { status: 502 });
    return NextResponse.json({ success: true, message: "Template update submitted to Meta. Refresh the library to check its latest status.", result });
  } catch (error) {
    console.error("Update WhatsApp template error:", error);
    return NextResponse.json({ success: false, message: "Could not update the template." }, { status: 500 });
  }
}
export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can create templates." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    const language = typeof body.language === "string" ? body.language.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim().toUpperCase() : "";
    const header = typeof body.header === "string" ? body.header.trim() : "";
    const headerFormat = typeof body.headerFormat === "string" ? body.headerFormat.toUpperCase() : "TEXT";
    const headerMediaHandle = typeof body.headerMediaHandle === "string" ? body.headerMediaHandle.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const footer = typeof body.footer === "string" ? body.footer.trim() : "";
    const requestedButtons = Array.isArray(body.buttons)
      ? body.buttons
      : body.button && typeof body.button === "object"
        ? [body.button]
        : [];
    const bodyExamples = body.bodyExamples && typeof body.bodyExamples === "object" ? body.bodyExamples : {};

    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json({ success: false, message: "Use a template name with lowercase letters, numbers, and underscores only." }, { status: 400 });
    }
    if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
      return NextResponse.json({ success: false, message: "Choose a valid language code, such as en_US or bn." }, { status: 400 });
    }
    if (!["UTILITY", "MARKETING"].includes(category)) {
      return NextResponse.json({ success: false, message: "Choose Utility or Marketing. Authentication templates use a separate Meta flow." }, { status: 400 });
    }
    if (!["TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat)) {
      return NextResponse.json({ success: false, message: "Choose a supported header format." }, { status: 400 });
    }
    if (headerFormat !== "TEXT" && !headerMediaHandle) {
      return NextResponse.json({ success: false, message: "Upload a media sample for the selected header type." }, { status: 400 });
    }
    if (!text || text.length > 1024 || (headerFormat === "TEXT" && header.length > 60) || footer.length > 60) {
      return NextResponse.json({ success: false, message: "Body is required (maximum 1,024 characters); header and footer are limited to 60 characters." }, { status: 400 });
    }

    const variables = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    const uniqueVariables = [...new Set(variables)].sort((a, b) => a - b);
    if (uniqueVariables.some((value, index) => value !== index + 1) || uniqueVariables.length > 10) {
      return NextResponse.json({ success: false, message: "Use sequential body variables starting at {{1}}, with no gaps (maximum 10)." }, { status: 400 });
    }

    const bodyExampleValues = uniqueVariables.map((number) =>
      typeof bodyExamples[number] === "string" ? bodyExamples[number].trim() : "",
    );
    if (bodyExampleValues.some((value) => !value || value.length > 1024)) {
      return NextResponse.json({ success: false, message: "Enter an example value for every BODY variable." }, { status: 400 });
    }

    const templateButtons = [];
    if (requestedButtons.length > 3) {
      return NextResponse.json({ success: false, message: "A template can have up to 3 quick reply buttons." }, { status: 400 });
    }
    const buttonTypes = requestedButtons.map((item) => String(item?.type || "").toUpperCase());
    const hasQuickReplies = buttonTypes.some((type) => type === "QUICK_REPLY");
    const hasCallToAction = buttonTypes.some((type) => ["URL", "PHONE_NUMBER"].includes(type));
    if (hasQuickReplies && hasCallToAction) {
      return NextResponse.json({ success: false, message: "Quick reply buttons cannot be mixed with call-to-action buttons." }, { status: 400 });
    }
    if (hasCallToAction && requestedButtons.length > 2) {
      return NextResponse.json({ success: false, message: "A template can have up to 2 call-to-action buttons." }, { status: 400 });
    }

    for (const item of requestedButtons) {
      const type = String(item?.type || "").toUpperCase();
      const buttonText = typeof item?.text === "string" ? item.text.trim() : "";
      if (!["QUICK_REPLY", "URL", "PHONE_NUMBER"].includes(type)) {
        return NextResponse.json({ success: false, message: "Choose Quick Reply, Website URL, or Phone Number for each button." }, { status: 400 });
      }
      if (!buttonText || buttonText.length > 25) {
        return NextResponse.json({ success: false, message: "Every button needs a label of 1–25 characters." }, { status: 400 });
      }

      if (type === "QUICK_REPLY") {
        templateButtons.push({ type: "QUICK_REPLY", text: buttonText });
        continue;
      }

      if (type === "PHONE_NUMBER") {
        const phoneNumber = typeof item.phone_number === "string" ? item.phone_number.trim() : "";
        if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
          return NextResponse.json({ success: false, message: "Enter a phone number in international E.164 format, such as +8801XXXXXXXXX." }, { status: 400 });
        }
        templateButtons.push({ type: "PHONE_NUMBER", text: buttonText, phone_number: phoneNumber });
        continue;
      }

      const buttonUrl = typeof item.url === "string" ? item.url.trim() : "";
      const isDynamic = item.dynamic === true;
      const buttonExample = typeof item.example === "string" ? item.example.trim() : "";
      const urlForValidation = isDynamic ? buttonUrl.replace(/\{\{1\}\}$/, "sample-value") : buttonUrl;
      let parsedUrl;
      try {
        parsedUrl = new URL(urlForValidation);
      } catch {
        return NextResponse.json({ success: false, message: "Enter a valid HTTPS website URL." }, { status: 400 });
      }
      if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password || buttonUrl.length > 2000) {
        return NextResponse.json({ success: false, message: "The website button must use a valid HTTPS URL." }, { status: 400 });
      }
      if (isDynamic && (!/\{\{1\}\}$/.test(buttonUrl) || !buttonExample || buttonExample.length > 200)) {
        return NextResponse.json({ success: false, message: "A dynamic URL must end with {{1}} and include a sample value." }, { status: 400 });
      }
      if (!isDynamic && /\{\{\d+\}\}/.test(buttonUrl)) {
        return NextResponse.json({ success: false, message: "Use Dynamic URL mode for a URL containing a variable." }, { status: 400 });
      }
      templateButtons.push({
        type: "URL",
        text: buttonText,
        url: buttonUrl,
        ...(isDynamic ? { example: [buttonUrl.replace(/\{\{1\}\}$/, buttonExample)] } : {}),
      });
    }

    const components = [];
    if (headerFormat === "TEXT" && header) components.push({ type: "HEADER", format: "TEXT", text: header });
    if (headerFormat !== "TEXT") components.push({ type: "HEADER", format: headerFormat, example: { header_handle: [headerMediaHandle] } });
    components.push({
      type: "BODY",
      text,
      ...(uniqueVariables.length
        ? { example: { body_text: [bodyExampleValues] } }
        : {}),
    });
    if (footer) components.push({ type: "FOOTER", text: footer });
    if (templateButtons.length) components.push({ type: "BUTTONS", buttons: templateButtons });

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account?.accessTokenEncrypted || !account.wabaId) {
      return NextResponse.json({ success: false, message: "Connect a WhatsApp Business Account first." }, { status: 404 });
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, language, category, components }),
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || result.error) {
      return NextResponse.json({
        success: false,
        message: result?.error?.error_user_msg || result?.error?.message || "Meta rejected the template request.",
        metaErrorCode: result?.error?.code || null,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      message: "Template submitted to Meta for review. Its status will appear after refreshing the library.",
      template: { id: result.id || null, name, language, category, status: "PENDING" },
    });
  } catch (error) {
    console.error("Create WhatsApp template error:", error);
    return NextResponse.json({ success: false, message: "Could not submit the template to Meta." }, { status: 500 });
  }
}
