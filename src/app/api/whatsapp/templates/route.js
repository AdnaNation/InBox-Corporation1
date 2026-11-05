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
    url.searchParams.set("fields", "id,name,status,language,category,components,parameter_format");
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
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const footer = typeof body.footer === "string" ? body.footer.trim() : "";

    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json({ success: false, message: "Use a template name with lowercase letters, numbers, and underscores only." }, { status: 400 });
    }
    if (!/^[a-z]{2,3}_[A-Z]{2}$/.test(language)) {
      return NextResponse.json({ success: false, message: "Choose a valid language code, such as en_US or bn." }, { status: 400 });
    }
    if (!["UTILITY", "MARKETING"].includes(category)) {
      return NextResponse.json({ success: false, message: "Choose Utility or Marketing. Authentication templates use a separate Meta flow." }, { status: 400 });
    }
    if (!text || text.length > 1024 || header.length > 60 || footer.length > 60) {
      return NextResponse.json({ success: false, message: "Body is required (maximum 1,024 characters); header and footer are limited to 60 characters." }, { status: 400 });
    }

    const variables = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
    const uniqueVariables = [...new Set(variables)].sort((a, b) => a - b);
    if (uniqueVariables.some((value, index) => value !== index + 1) || uniqueVariables.length > 10) {
      return NextResponse.json({ success: false, message: "Use sequential body variables starting at {{1}}, with no gaps (maximum 10)." }, { status: 400 });
    }

    const components = [];
    if (header) components.push({ type: "HEADER", format: "TEXT", text: header });
    components.push({ type: "BODY", text });
    if (footer) components.push({ type: "FOOTER", text: footer });

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
