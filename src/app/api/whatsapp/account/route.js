import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
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
    webhookCallbackUrl: 1,
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
    webhookCallbackUrl: item.webhookCallbackUrl || "",
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

  // Remove only Wavo's phone-number-level callback override. The customer's
  // WABA-level and app-level callbacks remain untouched.
  const remainingWabaAccount = await accounts.findOne({
    workspaceId,
    wabaId: target.wabaId,
    status: "connected",
    phoneNumberId: { $ne: target.phoneNumberId },
  });

  if (target.metaAppIdEncrypted && target.accessTokenEncrypted && target.webhookCallbackUrl && target.wabaId) {
    try {
      const metaAppId = decryptSecret(target.metaAppIdEncrypted);
      const accessToken = decryptSecret(target.accessTokenEncrypted);
      const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
      const headers = { Authorization: `Bearer ${accessToken}` };
      const phoneUrl = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(target.phoneNumberId)}`);
      phoneUrl.searchParams.set("fields", "webhook_configuration");
      const beforeResponse = await fetch(phoneUrl, { headers, cache: "no-store" });
      const beforeData = await beforeResponse.json().catch(() => ({}));
      if (!beforeResponse.ok || beforeData.error) {
        return NextResponse.json({ success: false, message: beforeData?.error?.message || "Could not inspect Meta's current phone webhook routing. The Wavo connection was left intact." }, { status: 502 });
      }
      const currentOverride = String(beforeData.webhook_configuration?.phone_number || "");
      if (currentOverride && currentOverride !== target.webhookCallbackUrl) {
        return NextResponse.json({ success: false, code: "PHONE_CALLBACK_OVERRIDE_CHANGED", message: "The phone-number callback override was changed outside Wavo. Wavo did not modify it or disconnect the account. Review the current Meta webhook configuration first." }, { status: 409 });
      }

      if (currentOverride === target.webhookCallbackUrl) {
        const restoreResponse = await fetch(phoneUrl, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ webhook_configuration: { override_callback_uri: "" } }),
          cache: "no-store",
        });
        const restoreData = await restoreResponse.json().catch(() => ({}));
        if (!restoreResponse.ok || restoreData.error || restoreData.success !== true) {
          return NextResponse.json({ success: false, message: restoreData?.error?.message || "Meta could not restore the previous callback routing for this phone number. The Wavo connection was left intact." }, { status: 502 });
        }
        const verifyResponse = await fetch(phoneUrl, { headers, cache: "no-store" });
        const verifyData = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok || verifyData.error || String(verifyData.webhook_configuration?.phone_number || "")) {
          return NextResponse.json({ success: false, message: "Meta did not confirm that the phone-number override was removed. The Wavo connection was left intact." }, { status: 502 });
        }
      }

      // If Wavo originally created the WABA subscription, keep that ownership
      // marker on another connected number in this WABA. Only unsubscribe when
      // the last Wavo-connected number is removed.
      if (target.subscriptionCreatedByWavo && remainingWabaAccount) {
        await accounts.updateOne(
          { _id: remainingWabaAccount._id, workspaceId, status: "connected" },
          { $set: { subscriptionCreatedByWavo: true, updatedAt: new Date() } },
        );
      } else if (target.subscriptionCreatedByWavo && !remainingWabaAccount) {
        const subscriptionUrl = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(target.wabaId)}/subscribed_apps`;
        const subscriptionResponse = await fetch(subscriptionUrl, { headers, cache: "no-store" });
        const subscriptionData = await subscriptionResponse.json().catch(() => ({}));
        if (!subscriptionResponse.ok || subscriptionData.error) {
          return NextResponse.json({ success: false, message: subscriptionData?.error?.message || "Could not inspect the WABA subscription before disconnecting. The Wavo connection was left intact." }, { status: 502 });
        }
        const appSubscription = (subscriptionData.data || []).find((item) => String(item.whatsapp_business_api_data?.id || item.id || "") === metaAppId);
        if (appSubscription) {
          const unsubscribeResponse = await fetch(subscriptionUrl, { method: "DELETE", headers, cache: "no-store" });
          const unsubscribeData = await unsubscribeResponse.json().catch(() => ({}));
          if (!unsubscribeResponse.ok || unsubscribeData.error) {
            return NextResponse.json({ success: false, message: unsubscribeData?.error?.message || "Meta could not restore the WABA's previous subscription state. The Wavo connection was left intact." }, { status: 502 });
          }
          const finalResponse = await fetch(subscriptionUrl, { headers, cache: "no-store" });
          const finalData = await finalResponse.json().catch(() => ({}));
          const stillSubscribed = (finalData.data || []).some((item) => String(item.whatsapp_business_api_data?.id || item.id || "") === metaAppId);
          if (!finalResponse.ok || finalData.error || stillSubscribed) {
            return NextResponse.json({ success: false, message: "Meta did not confirm restoration of the previous WABA subscription state. The Wavo connection was left intact." }, { status: 502 });
          }
        }
      }
    } catch (error) {
      console.error("WhatsApp phone webhook override restoration failed:", error);
      return NextResponse.json({ success: false, message: "Could not restore the customer's previous Meta webhook routing. The Wavo connection was left intact." }, { status: 502 });
    }
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
    { $set: { status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() }, $unset: { accessTokenEncrypted: "", metaAppIdEncrypted: "", metaAppSecretEncrypted: "", webhookVerifyTokenEncrypted: "", webhookCallbackUrl: "", isActive: "" } },
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
    message: "WhatsApp number disconnected. Its WABA callback override was removed so Meta can deliver messages to the customer\'s original Meta App callback again. Other connected numbers remain available.",
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
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid origin." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can manage the WhatsApp connection." }, { status: 403 });
  }

  let pendingFilter = null;
  let pendingCollection = null;
  let apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
  let authHeaders = null;
  let subscribeUrl = null;
  let phoneOverrideUrl = null;
  let wasSubscribedBefore = false;
  let subscriptionAttempted = false;
  let previousPhoneOverride = "";
  let phoneOverrideAttempted = false;
  let metaAppId = "";
  let callbackUrl = "";

  try {
    const body = await request.json();
    const required = ["phoneNumberId", "wabaId", "accessToken", "metaAppId", "metaAppSecret", "webhookVerifyToken"];
    for (const key of required) {
      const value = body[key];
      const max = key === "accessToken" || key === "metaAppSecret" ? 5000 : 500;
      if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
        return NextResponse.json({ success: false, message: "Complete the Meta App ID, App Secret, webhook verify token, WABA ID, Phone Number ID, and access token fields." }, { status: 400 });
      }
    }

    const phoneNumberId = body.phoneNumberId.trim();
    const wabaId = body.wabaId.trim();
    const accessToken = body.accessToken.trim();
    metaAppId = body.metaAppId.trim();
    const metaAppSecret = body.metaAppSecret.trim();
    const webhookVerifyToken = body.webhookVerifyToken.trim();
    callbackUrl = typeof body.webhookCallbackUrl === "string" && body.webhookCallbackUrl.trim()
      ? body.webhookCallbackUrl.trim()
      : new URL("/api/whatsapp/webhook", request.url).toString();

    if (!/^\d{5,30}$/.test(phoneNumberId) || !/^\d{5,30}$/.test(wabaId) || !/^\d{5,30}$/.test(metaAppId) || webhookVerifyToken.length < 8) {
      return NextResponse.json({ success: false, message: "Check the App ID, WABA ID, Phone Number ID, and webhook verify token. IDs must be numeric and the verify token must contain at least 8 characters." }, { status: 400 });
    }
    let callback;
    try { callback = new URL(callbackUrl); } catch {
      return NextResponse.json({ success: false, message: "Enter a valid public HTTPS webhook callback URL." }, { status: 400 });
    }
    if (callback.protocol !== "https:" || callbackUrl.length > 200 || ["localhost", "127.0.0.1", "::1"].includes(callback.hostname)) {
      return NextResponse.json({ success: false, message: "Meta must be able to reach the webhook. Use a public HTTPS URL of 200 characters or fewer, such as your Wavo domain or a public development tunnel—not localhost." }, { status: 400 });
    }

    const debugUrl = new URL(`https://graph.facebook.com/${apiVersion}/debug_token`);
    debugUrl.searchParams.set("input_token", accessToken);
    const debugResponse = await fetch(debugUrl, {
      headers: { Authorization: `Bearer ${metaAppId}|${metaAppSecret}` },
      cache: "no-store",
    });
    const debugData = await debugResponse.json().catch(() => ({}));
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

    authHeaders = { Authorization: `Bearer ${accessToken}` };
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
    const linkedElsewhere = await db.collection("whatsappAccounts").findOne({ phoneNumberId, status: "connected", workspaceId: { $ne: workspaceId } });
    if (linkedElsewhere) return NextResponse.json({ success: false, message: "This WhatsApp number is already connected to another Wavo workspace." }, { status: 409 });
    const wabaLinkedElsewhere = await db.collection("whatsappAccounts").findOne({ wabaId, status: "connected", workspaceId: { $ne: workspaceId } });
    if (wabaLinkedElsewhere) return NextResponse.json({ success: false, code: "WABA_ALREADY_CONNECTED", message: "This WhatsApp Business Account is already connected to another Wavo workspace. Keep all phone numbers belonging to one business WABA in the same workspace." }, { status: 409 });

    subscribeUrl = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(wabaId)}/subscribed_apps`;
    const beforeResponse = await fetch(subscribeUrl, { headers: authHeaders, cache: "no-store" });
    const beforeData = await beforeResponse.json().catch(() => ({}));
    if (!beforeResponse.ok || beforeData.error) {
      return NextResponse.json({ success: false, message: beforeData?.error?.message || "Could not inspect existing webhook subscriptions for this WABA.", metaErrorCode: beforeData?.error?.code || null }, { status: 422 });
    }
    const currentApp = (beforeData.data || []).find((item) => String(item.whatsapp_business_api_data?.id || item.id || "") === metaAppId);
    wasSubscribedBefore = Boolean(currentApp);

    // Use a phone-number-level override so connecting or disconnecting one
    // number never redirects every other number under the same WABA.
    phoneOverrideUrl = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}`;
    const phoneConfigUrl = new URL(phoneOverrideUrl);
    phoneConfigUrl.searchParams.set("fields", "webhook_configuration");
    const phoneConfigResponse = await fetch(phoneConfigUrl, { headers: authHeaders, cache: "no-store" });
    const phoneConfigData = await phoneConfigResponse.json().catch(() => ({}));
    if (!phoneConfigResponse.ok || phoneConfigData.error) {
      return NextResponse.json({ success: false, message: phoneConfigData?.error?.message || "Could not inspect the current phone-number webhook callback.", metaErrorCode: phoneConfigData?.error?.code || null }, { status: 422 });
    }
    previousPhoneOverride = String(phoneConfigData.webhook_configuration?.phone_number || "");
    if (previousPhoneOverride && previousPhoneOverride !== callbackUrl) {
      return NextResponse.json({ success: false, code: "EXISTING_PHONE_CALLBACK_OVERRIDE", message: `This phone number already has a different callback override (${previousPhoneOverride}). Wavo will not overwrite it.` }, { status: 409 });
    }

    pendingCollection = db.collection("whatsappPendingConnections");
    pendingFilter = { workspaceId, phoneNumberId };
    const now = new Date();
    const pending = {
      workspaceId, wabaId, phoneNumberId,
      accessTokenEncrypted: encryptSecret(accessToken),
      metaAppIdEncrypted: encryptSecret(metaAppId),
      metaAppSecretEncrypted: encryptSecret(metaAppSecret),
      webhookVerifyTokenEncrypted: encryptSecret(webhookVerifyToken),
      webhookCallbackUrl: callbackUrl,
      webhookCallbackScope: "phone_number",
      status: "pending",
      updatedAt: now,
    };
    await pendingCollection.updateOne(pendingFilter, { $set: pending, $setOnInsert: { createdAt: now } }, { upsert: true });

    // Subscribe the customer's App to the WABA if it is not subscribed yet.
    if (!wasSubscribedBefore) {
      subscriptionAttempted = true;
      const subscribeResponse = await fetch(subscribeUrl, { method: "POST", headers: authHeaders, cache: "no-store" });
      const subscribeData = await subscribeResponse.json().catch(() => ({}));
      if (!subscribeResponse.ok || subscribeData.error || subscribeData.success !== true) throw new Error(subscribeData?.error?.message || "Meta could not subscribe this App to the WABA.");
    }

    // The phone-number override takes precedence over any WABA or app-level
    // callback and affects only this phone number.
    phoneOverrideAttempted = true;
    const overrideResponse = await fetch(phoneOverrideUrl, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ webhook_configuration: { override_callback_uri: callbackUrl, verify_token: webhookVerifyToken } }),
      cache: "no-store",
    });
    const overrideData = await overrideResponse.json().catch(() => ({}));
    if (!overrideResponse.ok || overrideData.error || overrideData.success !== true) {
      throw new Error(overrideData?.error?.message || "Meta did not accept the phone-number webhook callback override.");
    }

    const verifyPhoneUrl = new URL(phoneOverrideUrl);
    verifyPhoneUrl.searchParams.set("fields", "webhook_configuration");
    const verifyPhoneResponse = await fetch(verifyPhoneUrl, { headers: authHeaders, cache: "no-store" });
    const verifyPhoneData = await verifyPhoneResponse.json().catch(() => ({}));
    const verifiedCallback = String(verifyPhoneData.webhook_configuration?.phone_number || "");
    const checkResponse = await fetch(subscribeUrl, { headers: authHeaders, cache: "no-store" });
    const checkData = await checkResponse.json().catch(() => ({}));
    const verifiedApp = (checkData.data || []).find((item) => String(item.whatsapp_business_api_data?.id || item.id || "") === metaAppId);
    if (!verifyPhoneResponse.ok || verifyPhoneData.error || verifiedCallback !== callbackUrl || !checkResponse.ok || checkData.error || !verifiedApp) {
      throw new Error(verifyPhoneData?.error?.message || checkData?.error?.message || "Meta did not confirm the phone-number callback override and WABA subscription. The connection was not completed.");
    }

    const existingNumber = await db.collection("whatsappAccounts").findOne({ workspaceId, phoneNumberId, status: "connected" });
    const existingWabaAccounts = await db.collection("whatsappAccounts").find({ workspaceId, wabaId, status: "connected" }).toArray();
    const activeAccount = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected", isActive: true });
    const account = {
      ...pending,
      status: "connected",
      isActive: !activeAccount || Boolean(existingNumber?.isActive),
      connectionMethod: "manual_customer_meta_app",
      subscriptionCreatedByWavo: !wasSubscribedBefore || existingWabaAccounts.some((item) => item.subscriptionCreatedByWavo === true),
      businessName: typeof body.businessName === "string" && body.businessName.trim() ? body.businessName.trim() : phoneData.verified_name || "WhatsApp Business",
      displayPhoneNumber: typeof body.displayPhoneNumber === "string" && body.displayPhoneNumber.trim() ? body.displayPhoneNumber.trim() : phoneData.display_phone_number || "",
      tokenSource: "manual",
      tokenIssuedAt: now,
      tokenExpiresAt: Number(tokenInfo.expires_at) > 0 ? new Date(Number(tokenInfo.expires_at) * 1000) : null,
      tokenExpiryKnown: Number(tokenInfo.expires_at) > 0,
    };
    await db.collection("whatsappAccounts").updateOne(
      { workspaceId, phoneNumberId },
      { $set: account, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    try { await pendingCollection.deleteOne(pendingFilter); } catch (cleanupError) { console.error("Pending WhatsApp connection cleanup failed:", cleanupError); }

    return NextResponse.json({
      success: true,
      message: "WhatsApp account connected. The phone-number-level override now routes this number's message webhooks to Wavo; the Meta App's default callback URL was not changed.",
      account: { businessName: account.businessName, displayPhoneNumber: account.displayPhoneNumber, phoneNumberId, wabaId },
      webhook: { callbackUrl, defaultCallbackPreserved: true, overrideVerified: true },
    });
  } catch (error) {
    if (pendingCollection && pendingFilter) {
      try { await pendingCollection.deleteOne(pendingFilter); } catch {}
    }
    // If Wavo added the subscription or override but connection finalization
    // failed, remove only the WABA override. Never alter the Meta App default.
    if (phoneOverrideUrl && authHeaders && phoneOverrideAttempted && previousPhoneOverride !== callbackUrl) {
      try {
        // Clear only this phone number's override. Other phone numbers and
        // the customer's WABA/app-level callbacks remain untouched.
        await fetch(phoneOverrideUrl, {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ webhook_configuration: { override_callback_uri: "" } }),
          cache: "no-store",
        });
      } catch (rollbackError) {
        console.error("Meta phone webhook override rollback failed:", rollbackError);
      }
    }
    if (subscribeUrl && authHeaders && subscriptionAttempted && !wasSubscribedBefore) {
      try {
        await fetch(subscribeUrl, { method: "DELETE", headers: authHeaders, cache: "no-store" });
      } catch (rollbackError) {
        console.error("Meta WABA subscription rollback failed:", rollbackError);
      }
    }
    console.error("Customer Meta WhatsApp connection error:", error);
    return NextResponse.json({ success: false, message: error?.message || "Could not connect this WhatsApp account. Check the supplied credentials and try again." }, { status: 502 });
  }
}
