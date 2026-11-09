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

  try {
    const body = await request.json();

    const {
      phoneNumberId,
      wabaId,
      displayPhoneNumber,
      businessName,
      accessToken,
    } = body;
    if (
      ![
        phoneNumberId,
        wabaId,
        displayPhoneNumber,
        businessName,
        accessToken,
      ].every(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0 &&
          value.length <= 500,
      )
    ) {
      return NextResponse.json(
        { success: false, message: "Complete all WhatsApp account fields." },
        { status: 400 },
      );
    }

    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const metaAppId = process.env.META_APP_ID;
    const metaAppSecret = process.env.META_APP_SECRET;

    // A shared Wavo webhook only receives this WABA's events when Wavo's
    // own Meta app is the app authorized on the supplied access token.
    // Checking the token against the app access token prevents accidentally
    // subscribing a customer's separate Meta app instead.
    if (!metaAppId || !metaAppSecret) {
      return NextResponse.json(
        { success: false, code: "META_APP_NOT_CONFIGURED", message: "Wavo's Meta App ID and App Secret must be configured before connecting customer WhatsApp accounts." },
        { status: 503 },
      );
    }

    let debugData;
    try {
      const debugUrl = new URL(`https://graph.facebook.com/${apiVersion}/debug_token`);
      debugUrl.searchParams.set("input_token", accessToken.trim());
      const debugResponse = await fetch(debugUrl, {
        headers: { Authorization: `Bearer ${metaAppId}|${metaAppSecret}` },
        cache: "no-store",
      });
      debugData = await debugResponse.json().catch(() => ({}));
      if (!debugResponse.ok || debugData.error) {
        return NextResponse.json(
          { success: false, code: "META_TOKEN_DEBUG_FAILED", message: debugData?.error?.message || "Wavo could not inspect this access token with Meta. Nothing was saved." },
          { status: 422 },
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, code: "META_TOKEN_DEBUG_UNAVAILABLE", message: "Could not reach Meta to inspect this access token. Nothing was saved; try again." },
        { status: 502 },
      );
    }

    const tokenInfo = debugData?.data || {};
    if (tokenInfo.is_valid !== true) {
      return NextResponse.json(
        { success: false, code: "INVALID_ACCESS_TOKEN", message: "Meta reports that this access token is invalid or expired." },
        { status: 422 },
      );
    }

    if (String(tokenInfo.app_id || "") !== String(metaAppId)) {
      return NextResponse.json(
        {
          success: false,
          code: "TOKEN_NOT_ISSUED_TO_WAVO_APP",
          message: "This token belongs to a different Meta app. To use Wavo's shared webhook, the customer must authorize Wavo's Meta app and provide a token issued to that app. A token from the customer's own Meta app will send webhook events to that app instead.",
        },
        { status: 422 },
      );
    }

    const grantedScopes = Array.isArray(tokenInfo.scopes) ? tokenInfo.scopes : [];
    const requiredScopes = ["whatsapp_business_management", "whatsapp_business_messaging"];
    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length) {
      return NextResponse.json(
        {
          success: false,
          code: "META_WHATSAPP_PERMISSIONS_MISSING",
          message: `This Wavo-authorized token is missing required permissions: ${missingScopes.join(", ")}. Re-authorize Wavo with both WhatsApp permissions.`,
          missingPermissions: missingScopes,
        },
        { status: 422 },
      );
    }
    const verifyUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId.trim())}`);
    verifyUrl.searchParams.set("fields", "id,display_phone_number,verified_name");
    let metaResponse;
    try {
      metaResponse = await fetch(verifyUrl, {
        headers: { Authorization: `Bearer ${accessToken.trim()}` },
        cache: "no-store",
      });
    } catch {
      return NextResponse.json(
        { success: false, message: "Could not reach Meta to verify this WhatsApp number. Nothing was saved; try again." },
        { status: 502 },
      );
    }
    const metaData = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok || String(metaData.id || "") !== phoneNumberId.trim()) {
      const errorCode = metaData?.error?.code;
      return NextResponse.json(
        {
          success: false,
          code: errorCode === 190 ? "INVALID_ACCESS_TOKEN" : "WHATSAPP_ACCOUNT_VERIFICATION_FAILED",
          message: errorCode === 190
            ? "Meta rejected this access token. Check that it is valid and has not expired."
            : metaResponse.status === 403
              ? "This token does not have permission to access the selected WhatsApp number."
              : metaData?.error?.message || "Meta could not verify this token for the selected WhatsApp number. Nothing was saved.",
          metaErrorCode: errorCode || null,
        },
        { status: 422 },
      );
    }

    const wabaUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId.trim())}/phone_numbers`);
    wabaUrl.searchParams.set("fields", "id");
    wabaUrl.searchParams.set("limit", "100");
    let wabaResponse;
    try {
      wabaResponse = await fetch(wabaUrl, {
        headers: { Authorization: `Bearer ${accessToken.trim()}` },
        cache: "no-store",
      });
    } catch {
      return NextResponse.json(
        { success: false, message: "Could not verify the WhatsApp Business Account with Meta. Nothing was saved." },
        { status: 502 },
      );
    }
    const wabaData = await wabaResponse.json().catch(() => ({}));
    if (!wabaResponse.ok || !(wabaData.data || []).some((item) => String(item.id) === phoneNumberId.trim())) {
      return NextResponse.json(
        {
          success: false,
          message: wabaData?.error?.message || "The selected Phone Number ID does not belong to the supplied WhatsApp Business Account ID.",
          metaErrorCode: wabaData?.error?.code || null,
        },
        { status: 422 },
      );
    }

    const db = await getDatabase();
    await ensureWhatsAppAccountIndexes(db);
    const workspaceId = new ObjectId(session.workspace.id);
    const linkedElsewhere = await db.collection("whatsappAccounts").findOne({
      phoneNumberId: phoneNumberId.trim(),
      status: "connected",
      workspaceId: { $ne: workspaceId },
    });
    if (linkedElsewhere) {
      return NextResponse.json(
        { success: false, message: "This WhatsApp number is already connected to another Wavo workspace." },
        { status: 409 },
      );
    }

    // Subscribe Wavo's Meta app to this WABA. This adds Wavo's webhook
    // subscription; it does not replace subscriptions owned by other Meta apps.
    let subscriptionResponse;
    try {
      subscriptionResponse = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId.trim())}/subscribed_apps`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken.trim()}` },
          cache: "no-store",
        },
      );
    } catch {
      return NextResponse.json(
        { success: false, message: "Meta verified the token, but Wavo could not subscribe its webhook to this WhatsApp Business Account. Nothing was saved." },
        { status: 502 },
      );
    }
    const subscriptionData = await subscriptionResponse.json().catch(() => ({}));
    if (!subscriptionResponse.ok || subscriptionData.error) {
      return NextResponse.json(
        {
          success: false,
          message: subscriptionData?.error?.message || "Meta did not allow Wavo to subscribe to this WhatsApp Business Account. Check whatsapp_business_management permission.",
          metaErrorCode: subscriptionData?.error?.code || null,
        },
        { status: 422 },
      );
    }

    // Confirm that Meta now lists Wavo's own app on this exact WABA. A
    // successful POST response alone is not enough to mark the connection live.
    let subscriptionCheck;
    try {
      const checkUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId.trim())}/subscribed_apps`);
      const checkResponse = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${accessToken.trim()}` },
        cache: "no-store",
      });
      subscriptionCheck = await checkResponse.json().catch(() => ({}));
      if (!checkResponse.ok || subscriptionCheck.error) {
        return NextResponse.json(
          {
            success: false,
            code: "WHATSAPP_SUBSCRIPTION_CHECK_FAILED",
            message: subscriptionCheck?.error?.message || "Meta accepted the subscription request, but Wavo could not verify it. Retry the connection; no account was saved.",
            metaErrorCode: subscriptionCheck?.error?.code || null,
          },
          { status: 502 },
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, code: "WHATSAPP_SUBSCRIPTION_CHECK_UNAVAILABLE", message: "Meta accepted the subscription request, but Wavo could not confirm it. Retry the connection; no account was saved." },
        { status: 502 },
      );
    }

    const wavoSubscribed = isMetaAppSubscribed(subscriptionCheck, metaAppId);
    if (!wavoSubscribed) {
      return NextResponse.json(
        {
          success: false,
          code: "WAVO_APP_NOT_SUBSCRIBED",
          message: "Meta did not list Wavo's app as subscribed to this WhatsApp Business Account. The number was not saved as connected.",
        },
        { status: 422 },
      );
    }

    const now = new Date();
    const existingNumber = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      phoneNumberId: phoneNumberId.trim(),
      status: "connected",
    });
    const activeAccount = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      status: "connected",
      isActive: true,
    });
    const shouldBecomeActive = !activeAccount || Boolean(existingNumber?.isActive);

    // Save or update the selected number.
    await db.collection("whatsappAccounts").updateOne(
      {
        workspaceId,
        phoneNumberId: phoneNumberId.trim(),
      },
      {
        $set: {
          workspaceId,
          wabaId: wabaId.trim(),
          phoneNumberId: phoneNumberId.trim(),
          displayPhoneNumber: displayPhoneNumber.trim(),
          businessName: businessName.trim(),
          accessTokenEncrypted: encryptSecret(accessToken.trim()),
          status: "connected",
          isActive: shouldBecomeActive,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
        $unset: {
          tokenIssuedAt: "",
          tokenExpiresAt: "",
          dataAccessExpiresAt: "",
          tokenExpiryKnown: "",
        },
      },
      { upsert: true },
    );

    return NextResponse.json({
      success: true,
      message: "WhatsApp account saved successfully.",
    });
  } catch (error) {
    console.error("WhatsApp account save error:", error);
    if (error?.code === 11000) {
      return NextResponse.json(
        { success: false, code: "WHATSAPP_ACCOUNT_CONFLICT", message: "This WhatsApp number is already connected elsewhere, or another administrator changed the active number. Refresh and try again." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Could not save WhatsApp account. Check ENCRYPTION_KEY and verify there are no duplicate connected WhatsApp numbers." },
      { status: 500 },
    );
  }
}
