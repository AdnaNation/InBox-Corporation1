import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { ensureWhatsAppAccountIndexes } from "@/lib/whatsapp-account";

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

  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json(
      { success: false, message: "Only workspace owners and admins can update the WhatsApp access token." },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

    if (accessToken.length < 20 || accessToken.length > 5000) {
      return NextResponse.json(
        { success: false, message: "Enter a valid Meta access token." },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    await ensureWhatsAppAccountIndexes(db);
    const workspaceId = new ObjectId(session.workspace.id);
    const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
    const accountFilter = { workspaceId, status: "connected" };
    if (phoneNumberId) accountFilter.phoneNumberId = phoneNumberId;
    else accountFilter.isActive = true;
    const account = await db.collection("whatsappAccounts").findOne(
      accountFilter,
      { projection: { phoneNumberId: 1, metaAppIdEncrypted: 1, metaAppSecretEncrypted: 1 } },
    );

    if (!account?.phoneNumberId) {
      return NextResponse.json(
        { success: false, message: "No connected WhatsApp number was found." },
        { status: 404 },
      );
    }

    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    // Each workspace validates replacement tokens against its own Meta App.
    // Global environment credentials remain a compatibility fallback for
    // legacy Wavo-owned connections created before per-customer credentials.
    const metaAppId = account.metaAppIdEncrypted
      ? decryptSecret(account.metaAppIdEncrypted)
      : process.env.META_APP_ID;
    const metaAppSecret = account.metaAppSecretEncrypted
      ? decryptSecret(account.metaAppSecretEncrypted)
      : process.env.META_APP_SECRET;
    if (!metaAppId || !metaAppSecret) {
      return NextResponse.json(
        { success: false, code: "CUSTOMER_META_APP_CREDENTIALS_MISSING", message: "This connection is missing its Meta App ID or App Secret. Reconnect it with the customer's Meta App credentials." },
        { status: 409 },
      );
    }

    const debugUrl = new URL(`https://graph.facebook.com/${apiVersion}/debug_token`);
    debugUrl.searchParams.set("input_token", accessToken);
    let debugResponse;
    let debugResult;
    try {
      debugResponse = await fetch(debugUrl, {
        headers: { Authorization: `Bearer ${metaAppId}|${metaAppSecret}` },
        cache: "no-store",
      });
      debugResult = await debugResponse.json().catch(() => ({}));
    } catch {
      return NextResponse.json(
        { success: false, code: "META_TOKEN_DEBUG_UNAVAILABLE", message: "Could not reach Meta to inspect this access token. The saved token was not changed." },
        { status: 502 },
      );
    }
    const tokenInfo = debugResult?.data || {};
    if (!debugResponse.ok || debugResult.error || tokenInfo.is_valid !== true) {
      return NextResponse.json(
        { success: false, code: "INVALID_ACCESS_TOKEN", message: debugResult?.error?.message || "Meta reports that this access token is invalid or expired. The saved token was not changed." },
        { status: 422 },
      );
    }
    if (String(tokenInfo.app_id || "") !== String(metaAppId)) {
      return NextResponse.json(
        { success: false, code: "META_APP_ID_MISMATCH", message: "This token belongs to a different Meta App than the one saved for this WhatsApp account. The saved token was not changed." },
        { status: 422 },
      );
    }
    const grantedScopes = Array.isArray(tokenInfo.scopes) ? tokenInfo.scopes : [];
    const requiredScopes = ["whatsapp_business_management", "whatsapp_business_messaging"];
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length) {
      return NextResponse.json(
        { success: false, code: "META_WHATSAPP_PERMISSIONS_MISSING", message: `This token is missing required permissions: ${missingScopes.join(", ")}. The saved token was not changed.`, missingPermissions: missingScopes },
        { status: 422 },
      );
    }

    const url = new URL(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(account.phoneNumberId)}`,
    );
    url.searchParams.set(
      "fields",
      "id,display_phone_number,verified_name,quality_rating,code_verification_status",
    );

    // Verify the replacement before changing the currently saved credential.
    const metaResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const metaResult = await metaResponse.json();

    if (!metaResponse.ok || metaResult.id !== account.phoneNumberId) {
      const errorCode = metaResult?.error?.code;
      const message = errorCode === 190
        ? "Meta rejected this access token. Check that it is active and copy it again."
        : metaResponse.status === 403
          ? "This token does not have permission to access the connected WhatsApp number."
          : "Meta could not verify this token for the connected number. The saved token was not changed.";
      return NextResponse.json(
        { success: false, message, metaErrorCode: errorCode || null },
        { status: 422 },
      );
    }

    const now = new Date();
    const update = await db.collection("whatsappAccounts").updateOne(
      { workspaceId, status: "connected", phoneNumberId: account.phoneNumberId },
      {
        $set: {
          accessTokenEncrypted: encryptSecret(accessToken),
          tokenUpdatedAt: now,
          tokenSource: "manual",
          updatedAt: now,
        },
        $unset: {
          tokenIssuedAt: "",
          tokenExpiresAt: "",
          dataAccessExpiresAt: "",
          tokenExpiryKnown: "",
        },
      },
    );

    if (!update.matchedCount) {
      return NextResponse.json(
        { success: false, message: "The connected WhatsApp account changed during this update. Refresh and try again." },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "New access token verified by Meta and saved securely. Its expiry date will show as unknown unless Meta supplies one.",
      verifiedPhoneNumberId: metaResult.id,
    });
  } catch (error) {
    console.error("WhatsApp access token update error:", error);
    return NextResponse.json(
      { success: false, message: "Could not update the access token. Please try again." },
      { status: 500 },
    );
  }
}
