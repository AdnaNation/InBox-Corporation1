import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret } from "@/lib/crypto";
import { ensureWhatsAppAccountIndexes } from "@/lib/whatsapp-account";
import { isMetaAppSubscribed } from "@/lib/whatsapp-subscription.mjs";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  const db = await getDatabase();
  await ensureWhatsAppAccountIndexes(db);
  const workspaceId = new ObjectId(session.workspace.id);
  const projection = {
    businessName: 1,
    displayPhoneNumber: 1,
    phoneNumberId: 1,
    wabaId: 1,
    isActive: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  let accounts = await db.collection("whatsappAccounts")
    .find({ workspaceId, status: "connected" })
    .project(projection)
    .sort({ createdAt: 1 })
    .toArray();

  // Backward-compatible migration: make the oldest existing connection active.
  if (accounts.length && !accounts.some((item) => item.isActive === true)) {
    await db.collection("whatsappAccounts").updateOne(
      { _id: accounts[0]._id, workspaceId, status: "connected" },
      { $set: { isActive: true, updatedAt: new Date() } },
    );
    accounts[0].isActive = true;
  }

  const serialize = (item) => ({
    id: item._id.toString(),
    businessName: item.businessName || "",
    displayPhoneNumber: item.displayPhoneNumber || "",
    phoneNumberId: item.phoneNumberId || "",
    wabaId: item.wabaId || "",
    isActive: item.isActive === true,
    connectedAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  });
  const serializedAccounts = accounts.map(serialize);
  const activeAccount = serializedAccounts.find((item) => item.isActive) || serializedAccounts[0] || null;

  return NextResponse.json({
    success: true,
    connected: serializedAccounts.length > 0,
    accounts: serializedAccounts,
    account: activeAccount,
  });
}

export async function DELETE(request) {
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
      { success: false, message: "Only workspace owners and admins can manage the WhatsApp connection." },
      { status: 403 },
    );
  }

  const db = await getDatabase();
  await ensureWhatsAppAccountIndexes(db);
  const workspaceId = new ObjectId(session.workspace.id);
  const activeCampaign = await db.collection("campaigns").findOne({
    workspaceId,
    status: { $in: ["queued", "sending"] },
  });

  if (activeCampaign) {
    return NextResponse.json(
      {
        success: false,
        message: "Pause or finish active campaigns before disconnecting WhatsApp.",
      },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  if (!phoneNumberId) {
    return NextResponse.json(
      { success: false, message: "Choose the WhatsApp number to disconnect." },
      { status: 400 },
    );
  }

  const accounts = db.collection("whatsappAccounts");
  const target = await accounts.findOne({ workspaceId, phoneNumberId, status: "connected" });
  if (!target) {
    return NextResponse.json({ success: false, message: "That WhatsApp number is not connected." }, { status: 404 });
  }

  if (target.isActive && target.phoneNumberId) {
    await db.collection("campaigns").updateMany(
      {
        workspaceId,
        status: { $in: ["scheduled", "queued", "sending"] },
        phoneNumberId: { $exists: false },
      },
      { $set: { phoneNumberId: target.phoneNumberId, updatedAt: new Date() } },
    );
  }

  await accounts.updateOne(
    { _id: target._id, workspaceId },
    { $set: { status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() }, $unset: { accessTokenEncrypted: "", isActive: "" } },
  );

  if (target.isActive) {
    const nextAccount = await accounts.findOne(
      { workspaceId, status: "connected" },
      { sort: { createdAt: 1 } },
    );
    if (nextAccount) {
      try {
        await accounts.updateOne(
          { _id: nextAccount._id, workspaceId, status: "connected" },
          { $set: { isActive: true, updatedAt: new Date() } },
        );
      } catch (error) {
        // A concurrent switch may already have selected another account.
        if (error?.code !== 11000) throw error;
      }
    }
  }

  return NextResponse.json({
    success: true,
    disconnected: true,
    message: "WhatsApp number disconnected. Other connected numbers remain available.",
  });
}

export async function PATCH(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid origin." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can switch the active WhatsApp number." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
  if (!phoneNumberId) return NextResponse.json({ success: false, message: "Choose a WhatsApp number." }, { status: 400 });
  const db = await getDatabase();
  await ensureWhatsAppAccountIndexes(db);
  const workspaceId = new ObjectId(session.workspace.id);
  const accounts = db.collection("whatsappAccounts");
  const target = await accounts.findOne({ workspaceId, phoneNumberId, status: "connected" });
  if (!target) return NextResponse.json({ success: false, message: "That WhatsApp number is not connected." }, { status: 404 });

  // Preserve the sender number for campaigns queued before multi-number support.
  const currentActive = await accounts.findOne({ workspaceId, status: "connected", isActive: true });
  if (currentActive?.phoneNumberId) {
    await db.collection("campaigns").updateMany(
      {
        workspaceId,
        status: { $in: ["scheduled", "queued", "sending"] },
        phoneNumberId: { $exists: false },
      },
      { $set: { phoneNumberId: currentActive.phoneNumberId, updatedAt: new Date() } },
    );
  }

  try {
    await accounts.updateMany(
      { workspaceId, status: "connected", isActive: true },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
    await accounts.updateOne(
      { _id: target._id, workspaceId, status: "connected" },
      { $set: { isActive: true, updatedAt: new Date() } },
    );
  } catch (error) {
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, code: "WHATSAPP_ACCOUNT_SWITCH_CONFLICT", message: "Another administrator changed the active WhatsApp number at the same time. Refresh and try again." },
        { status: 409 },
      );
    }
    throw error;
  }
  return NextResponse.json({ success: true, message: "Active WhatsApp number switched successfully." });
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid origin." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can manage the WhatsApp connection." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const fields = {
      phoneNumberId: body.phoneNumberId,
      wabaId: body.wabaId,
      accessToken: body.accessToken,
      metaAppId: body.metaAppId,
      metaAppSecret: body.metaAppSecret,
      webhookVerifyToken: body.webhookVerifyToken,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== "string" || !value.trim() || value.trim().length > (key === "accessToken" || key === "metaAppSecret" ? 5000 : 500)) {
        return NextResponse.json({ success: false, message: "Complete the Meta App ID, App Secret, webhook verify token, WABA ID, Phone Number ID, and access token fields." }, { status: 400 });
      }
    }
    const phoneNumberId = fields.phoneNumberId.trim();
    const wabaId = fields.wabaId.trim();
    const accessToken = fields.accessToken.trim();
    const metaAppId = fields.metaAppId.trim();
    const metaAppSecret = fields.metaAppSecret.trim();
    const webhookVerifyToken = fields.webhookVerifyToken.trim();
    if (!/^\d{5,30}$/.test(phoneNumberId) || !/^\d{5,30}$/.test(wabaId) || !/^\d{5,30}$/.test(metaAppId) || webhookVerifyToken.length < 8) {
      return NextResponse.json({ success: false, message: "Check the App ID, WABA ID, Phone Number ID, and webhook verify token. IDs must be numeric and the verify token must contain at least 8 characters." }, { status: 400 });
    }

    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const debugUrl = new URL(`https://graph.facebook.com/${apiVersion}/debug_token`);
    debugUrl.searchParams.set("input_token", accessToken);
    let debugResponse;
    let debugData;
    try {
      debugResponse = await fetch(debugUrl, {
        headers: { Authorization: `Bearer ${metaAppId}|${metaAppSecret}` },
        cache: "no-store",
      });
      debugData = await debugResponse.json().catch(() => ({}));
    } catch {
      return NextResponse.json({ success: false, code: "META_TOKEN_DEBUG_UNAVAILABLE", message: "Could not reach Meta to validate these credentials. Nothing was saved." }, { status: 502 });
    }
    const tokenInfo = debugData?.data || {};
    if (!debugResponse.ok || debugData.error || tokenInfo.is_valid !== true) {
      return NextResponse.json({ success: false, code: "INVALID_ACCESS_TOKEN", message: debugData?.error?.message || "Meta reports that this access token is invalid or expired. Nothing was saved." }, { status: 422 });
    }
    if (String(tokenInfo.app_id || "") !== metaAppId) {
      return NextResponse.json({ success: false, code: "META_APP_ID_MISMATCH", message: "The access token was not issued by the Meta App ID you entered. Use credentials and a token from the same Meta App." }, { status: 422 });
    }
    const grantedScopes = Array.isArray(tokenInfo.scopes) ? tokenInfo.scopes : [];
    const requiredScopes = ["whatsapp_business_management", "whatsapp_business_messaging"];
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length) {
      return NextResponse.json({ success: false, code: "META_WHATSAPP_PERMISSIONS_MISSING", message: `The token is missing required permissions: ${missingScopes.join(", ")}.`, missingPermissions: missingScopes }, { status: 422 });
    }

    const authHeaders = { Authorization: `Bearer ${accessToken}` };
    const phoneUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}`);
    phoneUrl.searchParams.set("fields", "id,display_phone_number,verified_name");
    const phoneResponse = await fetch(phoneUrl, { headers: authHeaders, cache: "no-store" });
    const phoneData = await phoneResponse.json().catch(() => ({}));
    if (!phoneResponse.ok || String(phoneData.id || "") !== phoneNumberId) {
      return NextResponse.json({ success: false, code: "WHATSAPP_ACCOUNT_VERIFICATION_FAILED", message: phoneData?.error?.message || "Meta could not verify this token for the supplied Phone Number ID.", metaErrorCode: phoneData?.error?.code || null }, { status: 422 });
    }

    const wabaUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/phone_numbers`);
    wabaUrl.searchParams.set("fields", "id");
    wabaUrl.searchParams.set("limit", "100");
    const wabaResponse = await fetch(wabaUrl, { headers: authHeaders, cache: "no-store" });
    const wabaData = await wabaResponse.json().catch(() => ({}));
    if (!wabaResponse.ok || !(wabaData.data || []).some((item) => String(item.id) === phoneNumberId)) {
      return NextResponse.json({ success: false, code: "WHATSAPP_WABA_PHONE_MISMATCH", message: wabaData?.error?.message || "The Phone Number ID does not belong to the supplied WABA ID.", metaErrorCode: wabaData?.error?.code || null }, { status: 422 });
    }

    const db = await getDatabase();
    await ensureWhatsAppAccountIndexes(db);
    const workspaceId = new ObjectId(session.workspace.id);
    const linkedElsewhere = await db.collection("whatsappAccounts").findOne({
      phoneNumberId, status: "connected", workspaceId: { $ne: workspaceId },
    });
    if (linkedElsewhere) {
      return NextResponse.json({ success: false, message: "This WhatsApp number is already connected to another Wavo workspace." }, { status: 409 });
    }

    // Subscribe the customer's own Meta app to its WABA. The app's webhook
    // callback must be configured to this Wavo endpoint in that Meta app.
    const subscribeUrl = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`;
    const subscribeResponse = await fetch(subscribeUrl, { method: "POST", headers: authHeaders, cache: "no-store" });
    const subscribeData = await subscribeResponse.json().catch(() => ({}));
    if (!subscribeResponse.ok || subscribeData.error) {
      return NextResponse.json({ success: false, code: "META_WABA_SUBSCRIPTION_FAILED", message: subscribeData?.error?.message || "Meta did not allow this app to subscribe to the WABA.", metaErrorCode: subscribeData?.error?.code || null }, { status: 422 });
    }
    const checkResponse = await fetch(subscribeUrl, { headers: authHeaders, cache: "no-store" });
    const checkData = await checkResponse.json().catch(() => ({}));
    if (!checkResponse.ok || checkData.error || !isMetaAppSubscribed(checkData, metaAppId)) {
      return NextResponse.json({ success: false, code: "CUSTOMER_APP_NOT_SUBSCRIBED", message: checkData?.error?.message || "Meta did not confirm that the customer's Meta App is subscribed to this WABA. The account was not saved.", metaErrorCode: checkData?.error?.code || null }, { status: 422 });
    }

    const existingNumber = await db.collection("whatsappAccounts").findOne({ workspaceId, phoneNumberId, status: "connected" });
    const activeAccount = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected", isActive: true });
    const now = new Date();
    const account = {
      workspaceId,
      wabaId,
      phoneNumberId,
      displayPhoneNumber: typeof body.displayPhoneNumber === "string" && body.displayPhoneNumber.trim() ? body.displayPhoneNumber.trim() : phoneData.display_phone_number || "",
      businessName: typeof body.businessName === "string" && body.businessName.trim() ? body.businessName.trim() : phoneData.verified_name || "WhatsApp Business",
      accessTokenEncrypted: encryptSecret(accessToken),
      metaAppIdEncrypted: encryptSecret(metaAppId),
      metaAppSecretEncrypted: encryptSecret(metaAppSecret),
      webhookVerifyTokenEncrypted: encryptSecret(webhookVerifyToken),
      connectionMethod: "manual_customer_meta_app",
      status: "connected",
      isActive: !activeAccount || Boolean(existingNumber?.isActive),
      tokenSource: "manual",
      tokenIssuedAt: now,
      tokenExpiresAt: Number(tokenInfo.expires_at) > 0 ? new Date(Number(tokenInfo.expires_at) * 1000) : null,
      tokenExpiryKnown: Number(tokenInfo.expires_at) > 0,
      updatedAt: now,
    };
    await db.collection("whatsappAccounts").updateOne(
      { workspaceId, phoneNumberId },
      { $set: account, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );

    return NextResponse.json({
      success: true,
      message: "WhatsApp account connected. Now configure this Meta App's webhook callback URL and verify token using the instructions below.",
      account: { businessName: account.businessName, displayPhoneNumber: account.displayPhoneNumber, phoneNumberId, wabaId },
      webhook: { callbackUrl: new URL("/api/whatsapp/webhook", request.url).toString(), verifyTokenConfigured: true },
    });
  } catch (error) {
    console.error("Customer Meta WhatsApp connection error:", error);
    return NextResponse.json({ success: false, message: "Could not connect this WhatsApp account. Check the supplied credentials and try again." }, { status: 500 });
  }
}
