import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    if (!isPlatformAdmin(session)) return NextResponse.json({ success: false, message: "Platform administrator access required." }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const workspaceIdValue = searchParams.get("workspaceId") || "";
    const phoneNumberId = searchParams.get("phoneNumberId") || "";
    const after = searchParams.get("after") || "";
    if (!ObjectId.isValid(workspaceIdValue) || !/^\d{5,30}$/.test(phoneNumberId)) {
      return NextResponse.json({ success: false, message: "A valid workspace, Phone Number ID, and pagination cursor are required." }, { status: 400 });
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(workspaceIdValue);
    const account = await getActiveWhatsAppAccount(db, workspaceId, phoneNumberId);
    if (!account?.accessTokenEncrypted || !account.wabaId) {
      return NextResponse.json({ success: false, message: "This WhatsApp account is not connected or its credentials are unavailable." }, { status: 404 });
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const url = new URL(`https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates`);
    url.searchParams.set("fields", "id,name,status,language,category,quality_score,rejected_reason");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      return NextResponse.json({
        success: false,
        message: result?.error?.error_user_msg || result?.error?.message || "Meta could not load this account's templates.",
        metaErrorCode: result?.error?.code || null,
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      templates: (result.data || []).map((template) => ({
        id: template.id,
        name: template.name,
        status: template.status,
        language: template.language,
        category: template.category,
        qualityScore: template.quality_score?.score || null,
        rejectedReason: template.rejected_reason || null,
      })),
      hasMore: Boolean(result.paging?.cursors?.after && result.paging?.next),
      nextCursor: result.paging?.next ? result.paging?.cursors?.after || null : null,
      account: {
        businessName: account.businessName || "",
        displayPhoneNumber: account.displayPhoneNumber || "",
      },
    });
  } catch (error) {
    console.error("Platform admin template list error:", error);
    return NextResponse.json({ success: false, message: "Could not load WhatsApp templates." }, { status: 500 });
  }
}
