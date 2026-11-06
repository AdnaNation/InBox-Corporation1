import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
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
    const { searchParams } = new URL(request.url);
    const requestedPhoneNumberId = searchParams.get("phoneNumberId");
    const accountFilter = { workspaceId, status: "connected" };
    if (requestedPhoneNumberId) accountFilter.phoneNumberId = requestedPhoneNumberId;
    else accountFilter.isActive = true;
    const account = await db.collection("whatsappAccounts").findOne(
      accountFilter,
      {
        projection: {
          businessName: 1,
          displayPhoneNumber: 1,
          phoneNumberId: 1,
          wabaId: 1,
          accessTokenEncrypted: 1,
          updatedAt: 1,
          tokenExpiresAt: 1,
          dataAccessExpiresAt: 1,
          tokenExpiryKnown: 1,
          lastHealthCheckAt: 1,
          lastHealthStatus: 1,
          lastHealthMessage: 1,
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

    const now = new Date();
    const tokenExpiresAt = account.tokenExpiresAt instanceof Date
      ? account.tokenExpiresAt
      : account.tokenExpiresAt
        ? new Date(account.tokenExpiresAt)
        : null;
    const dataAccessExpiresAt = account.dataAccessExpiresAt instanceof Date
      ? account.dataAccessExpiresAt
      : account.dataAccessExpiresAt
        ? new Date(account.dataAccessExpiresAt)
        : null;
    const remainingMs = tokenExpiresAt ? tokenExpiresAt.getTime() - now.getTime() : null;
    const tokenExpiryStatus = remainingMs === null
      ? "unknown"
      : remainingMs <= 0
        ? "expired"
        : remainingMs <= 7 * 24 * 60 * 60 * 1000
          ? "expiring"
          : "valid";

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
          tokenExpiryStatus,
          tokenExpiresAt: tokenExpiresAt?.toISOString() || null,
          dataAccessExpiresAt: dataAccessExpiresAt?.toISOString() || null,
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
        tokenExpiryStatus,
        tokenExpiresAt: tokenExpiresAt?.toISOString() || null,
        dataAccessExpiresAt: dataAccessExpiresAt?.toISOString() || null,
        connectionStatus: tokenExpiryStatus === "expired" || tokenExpiryStatus === "expiring" ? "attention" : "healthy",
        message: tokenExpiryStatus === "expired"
          ? "The saved token has passed its recorded expiry date. Reconnect with Meta to restore reliable access."
          : tokenExpiryStatus === "expiring"
            ? "The saved token is due to expire within 7 days. Reconnect with Meta before access is interrupted."
            : tokenExpiryStatus === "unknown"
              ? "Meta accepted the saved token. Its expiry date was not supplied, so continue monitoring account health."
              : "WhatsApp account and token are healthy.",
        businessName: account.businessName || "",
        displayPhoneNumber: result.display_phone_number || account.displayPhoneNumber || "",
        phoneNumberId: result.id || account.phoneNumberId,
        verifiedName: result.verified_name || "",
        qualityRating: result.quality_rating || "UNKNOWN",
        codeVerificationStatus: result.code_verification_status || "UNKNOWN",
        platformType: result.platform_type || "UNKNOWN",
        lastAutomatedCheckAt: account.lastHealthCheckAt?.toISOString?.() || account.lastHealthCheckAt || null,
        lastAutomatedStatus: account.lastHealthStatus || "not_checked",
        lastAutomatedMessage: account.lastHealthMessage || "Scheduled monitoring has not run yet.",
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
