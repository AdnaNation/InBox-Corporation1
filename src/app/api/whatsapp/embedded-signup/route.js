import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret } from "@/lib/crypto";
import { ensureWhatsAppAccountIndexes } from "@/lib/whatsapp-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function metaRequest(url, options = {}) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data?.error?.message || "Meta API request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  const appId = process.env.META_APP_ID;
  const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID;
  if (!appId || !configId) {
    return NextResponse.json({
      success: true,
      configured: false,
      message: "Set META_APP_ID and META_EMBEDDED_SIGNUP_CONFIG_ID to enable Meta signup.",
    });
  }

  return NextResponse.json({ success: true, configured: true, appId, configId, apiVersion: process.env.META_GRAPH_API_VERSION || "v26.0" });
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can connect WhatsApp." }, { status: 403 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
  if (!appId || !appSecret) {
    return NextResponse.json({ success: false, message: "Meta app credentials are not configured on the server." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : "";
    const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
    if (!code || code.length > 4096 || !/^\d{5,30}$/.test(wabaId) || !/^\d{5,30}$/.test(phoneNumberId)) {
      return NextResponse.json({ success: false, message: "Meta did not return a valid authorization code, WhatsApp Business Account ID, and Phone Number ID. Please try signup again." }, { status: 400 });
    }

    const db = await getDatabase();
    await ensureWhatsAppAccountIndexes(db);
    const workspaceId = new ObjectId(session.workspace.id);
    const linkedElsewhere = await db.collection("whatsappAccounts").findOne({
      phoneNumberId,
      status: "connected",
      workspaceId: { $ne: workspaceId },
    });
    if (linkedElsewhere) {
      return NextResponse.json(
        { success: false, message: "This WhatsApp number is already connected to another Wavo workspace." },
        { status: 409 },
      );
    }
    const existingNumber = await db.collection("whatsappAccounts").findOne({ workspaceId, phoneNumberId, status: "connected" });
    const activeAccount = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected", isActive: true });
    const shouldBecomeActive = !activeAccount || Boolean(existingNumber?.isActive);

    // Embedded Signup authorization codes are short-lived and single-use.
    // Exchange immediately on the server; never expose the app secret or token to the browser.
    const tokenUrl = new URL(`https://graph.facebook.com/${apiVersion}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    const tokenData = await metaRequest(tokenUrl);

    if (!tokenData.access_token) {
      throw new Error("Meta did not return an access token.");
    }

    const accessToken = tokenData.access_token;
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    // Verify the selected phone number belongs to the WABA granted by this signup.
    const phoneUrl = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers`);
    phoneUrl.searchParams.set("fields", "id,display_phone_number,verified_name");
    phoneUrl.searchParams.set("limit", "100");
    const phoneData = await metaRequest(phoneUrl, { headers: authHeaders });
    const phone = (phoneData.data || []).find((item) => String(item.id) === phoneNumberId);

    if (!phone) {
      return NextResponse.json({ success: false, message: "The selected phone number was not found inside the WhatsApp Business Account shared with this app." }, { status: 403 });
    }

    const businessUrl = new URL(`https://graph.facebook.com/${apiVersion}/${wabaId}`);
    businessUrl.searchParams.set("fields", "id,name");
    const businessData = await metaRequest(businessUrl, { headers: authHeaders });

    // Subscribe the app to this WABA so inbound messages and delivery statuses reach our webhook.
    const subscribeUrl = `https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`;
    await metaRequest(subscribeUrl, { method: "POST", headers: authHeaders });

    // Confirm the Wavo app is actually listed on this WABA before persisting
    // the connection. This prevents a false-positive Connected state.
    const subscriptionData = await metaRequest(subscribeUrl, { headers: authHeaders });
    const wavoSubscribed = (subscriptionData.data || []).some((item) =>
      String(item.whatsapp_business_api_data?.id || item.id || "") === String(appId),
    );
    if (!wavoSubscribed) {
      return NextResponse.json({
        success: false,
        code: "WAVO_APP_NOT_SUBSCRIBED",
        message: "Meta did not list Wavo's app as subscribed to this WhatsApp Business Account. The account was not saved as connected.",
      }, { status: 422 });
    }

    const now = new Date();
    const expiresInSeconds = Number(tokenData.expires_in);
    const tokenExpiresAt = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? new Date(now.getTime() + expiresInSeconds * 1000)
      : null;
    const dataAccessExpiresAt = Number(tokenData.data_access_expires_at) > 0
      ? new Date(Number(tokenData.data_access_expires_at) * 1000)
      : null;
    const account = {
      workspaceId,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || "",
      businessName: phone.verified_name || businessData.name || "WhatsApp Business",
      accessTokenEncrypted: encryptSecret(accessToken),
      status: "connected",
      isActive: shouldBecomeActive,
      connectionMethod: "embedded_signup_v4",
      tokenIssuedAt: now,
      tokenExpiresAt,
      dataAccessExpiresAt,
      tokenExpiryKnown: Boolean(tokenExpiresAt),
      updatedAt: now,
    };

    await db.collection("whatsappAccounts").updateOne(
      { workspaceId, phoneNumberId },
      {
        $set: account,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    return NextResponse.json({
      success: true,
      message: "WhatsApp Business account connected successfully through Meta.",
      account: {
        businessName: account.businessName,
        displayPhoneNumber: account.displayPhoneNumber,
        phoneNumberId,
        wabaId,
      },
    });
  } catch (error) {
    console.error("Meta Embedded Signup completion failed:", error.message);
    return NextResponse.json({
      success: false,
      message: error.message || "Meta signup could not be completed. Please try again.",
    }, { status: error.status && error.status >= 400 && error.status < 500 ? 400 : 502 });
  }
}
