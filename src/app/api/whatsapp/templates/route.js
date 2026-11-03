import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();

    const account = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      status: "connected",
    });

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Connect a WhatsApp account first." },
        { status: 404 },
      );
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v22.0";

    const url = new URL(
      `https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates`,
    );

    url.searchParams.set(
      "fields",
      "id,name,status,language,category,components,parameter_format",
    );
    url.searchParams.set("limit", "100");

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Meta template list error:", result);

      return NextResponse.json(
        {
          success: false,
          message:
            result?.error?.message || "Could not retrieve WhatsApp templates.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      templates: result.data || [],
      account: {
        displayPhoneNumber: account.displayPhoneNumber,
        businessName: account.businessName,
      },
      hasMore: Boolean(result.paging?.next),
    });
  } catch (error) {
    console.error("Load WhatsApp templates error:", error);

    return NextResponse.json(
      { success: false, message: "Could not load templates." },
      { status: 500 },
    );
  }
}
