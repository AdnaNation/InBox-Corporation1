import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_STATUSES = new Set(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "IN_APPEAL", "PENDING_DELETION", "DELETED"]);

export async function GET(request) {
  const auth = await authenticateApiKey(request, "templates:read");
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      {
        status: auth.status,
        headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") || 100);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json({ success: false, message: "The limit must be an integer between 1 and 100." }, { status: 400 });
  }

  const status = searchParams.get("status")?.toUpperCase() || "";
  if (status && !TEMPLATE_STATUSES.has(status)) {
    return NextResponse.json({ success: false, message: "Unsupported template status filter." }, { status: 400 });
  }

  const after = searchParams.get("after") || "";
  if (after && (!/^[A-Za-z0-9_-]{1,512}$/.test(after))) {
    return NextResponse.json({ success: false, message: "The after cursor is invalid." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const account = await getActiveWhatsAppAccount(db, workspaceId);
  if (!account?.accessTokenEncrypted || !account.wabaId) {
    return NextResponse.json({ success: false, code: "WHATSAPP_NOT_CONNECTED", message: "No active connected WhatsApp account is available for this workspace." }, { status: 409 });
  }

  const accessToken = decryptSecret(account.accessTokenEncrypted);
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
  const url = new URL("https://graph.facebook.com/" + apiVersion + "/" + account.wabaId + "/message_templates");
  url.searchParams.set("fields", "id,name,status,language,category,components,parameter_format");
  url.searchParams.set("limit", String(requestedLimit));
  if (status) url.searchParams.set("status", status);
  if (after) url.searchParams.set("after", after);

  let response;
  let result;
  try {
    response = await fetch(url, {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store",
    });
    result = await response.json();
  } catch {
    return NextResponse.json({ success: false, code: "META_TEMPLATE_LOOKUP_FAILED", message: "Could not reach Meta to retrieve templates." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({
      success: false,
      code: "META_TEMPLATE_LOOKUP_FAILED",
      message: result?.error?.message || "Meta could not retrieve WhatsApp templates.",
      metaErrorCode: result?.error?.code || null,
    }, { status: 502 });
  }

  const templates = (result.data || []).map((template) => ({
    id: template.id || null,
    name: template.name,
    status: template.status,
    language: template.language,
    category: template.category || null,
    parameterFormat: template.parameter_format || "POSITIONAL",
    components: (template.components || []).map((component) => ({
      type: component.type,
      ...(component.format ? { format: component.format } : {}),
      ...(component.text ? { text: component.text } : {}),
      ...(component.buttons ? {
        buttons: component.buttons.map((button) => ({
          type: button.type,
          text: button.text || "",
          ...(button.url ? { url: button.url } : {}),
        })),
      } : {}),
    })),
  }));

  return NextResponse.json({
    success: true,
    data: templates,
    pagination: {
      limit: requestedLimit,
      returned: templates.length,
      hasMore: Boolean(result.paging?.next),
      nextCursor: result.paging?.cursors?.after || null,
    },
  });
}
