import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  try {
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const account = await db.collection("whatsappAccounts").findOne(
      { workspaceId, status: "connected" },
      {
        projection: {
          businessName: 1,
          displayPhoneNumber: 1,
          phoneNumberId: 1,
          wabaId: 1,
          accessTokenEncrypted: 1,
          updatedAt: 1,
        },
      },
    );

    if (!account) {
      return NextResponse.json({
        success: true,
        connected: false,
        checkedAt: new Date().toISOString(),
        health: null,
      });
    }

    if (!account.accessTokenEncrypted) {
      return NextResponse.json({
        success: true,
        connected: true,
        checkedAt: new Date().toISOString(),
        health: {
          tokenStatus: "missing",
          connectionStatus: "attention",
          message: "No saved access token was found. Reconnect this WhatsApp account.",
        },
      });
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const url = new URL(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(account.phoneNumberId)}`,
    );
    url.searchParams.set(
      "fields",
      "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type",
    );

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok) {
      const errorCode = result?.error?.code;
      const tokenStatus = errorCode === 190 || response.status === 401
        ? "invalid"
        : response.status === 403
          ? "permission"
          : "unknown";

      return NextResponse.json({
        success: true,
        connected: true,
        checkedAt: new Date().toISOString(),
        health: {
          tokenStatus,
          connectionStatus: "attention",
          message: tokenStatus === "invalid"
            ? "Meta rejected the saved access token. Generate a valid token and reconnect."
            : tokenStatus === "permission"
              ? "Meta denied access to this phone number. Check token permissions and business access."
              : "Meta could not verify this number right now. Try again later.",
          metaErrorCode: errorCode || null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      checkedAt: new Date().toISOString(),
      health: {
        tokenStatus: "valid",
        connectionStatus: "healthy",
        businessName: account.businessName || "",
        displayPhoneNumber: result.display_phone_number || account.displayPhoneNumber || "",
        phoneNumberId: result.id || account.phoneNumberId,
        verifiedName: result.verified_name || "",
        qualityRating: result.quality_rating || "UNKNOWN",
        codeVerificationStatus: result.code_verification_status || "UNKNOWN",
        platformType: result.platform_type || "UNKNOWN",
      },
    });
  } catch (error) {
    console.error("WhatsApp account health check error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Could not check WhatsApp account health. Try again later.",
      },
      { status: 500 },
    );
  }
}
