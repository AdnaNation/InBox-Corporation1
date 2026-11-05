import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret } from "@/lib/crypto";

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
      await accounts.updateOne(
        { _id: nextAccount._id, workspaceId },
        { $set: { isActive: true, updatedAt: new Date() } },
      );
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
  const workspaceId = new ObjectId(session.workspace.id);
  const accounts = db.collection("whatsappAccounts");
  const target = await accounts.findOne({ workspaceId, phoneNumberId, status: "connected" });
  if (!target) return NextResponse.json({ success: false, message: "That WhatsApp number is not connected." }, { status: 404 });
  await accounts.updateMany({ workspaceId, status: "connected" }, { $set: { isActive: false, updatedAt: new Date() } });
  await accounts.updateOne({ _id: target._id, workspaceId }, { $set: { isActive: true, updatedAt: new Date() } });
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

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const now = new Date();
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

    return NextResponse.json(
      {
        success: false,
        message: "Could not save WhatsApp account. Check ENCRYPTION_KEY.",
      },
      { status: 500 },
    );
  }
}
