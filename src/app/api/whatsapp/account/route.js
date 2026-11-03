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
  const account = await db.collection("whatsappAccounts").findOne(
    { workspaceId, status: "connected" },
    {
      projection: {
        businessName: 1,
        displayPhoneNumber: 1,
        phoneNumberId: 1,
        wabaId: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );

  return NextResponse.json({
    success: true,
    connected: Boolean(account),
    account: account
      ? {
          businessName: account.businessName || "",
          displayPhoneNumber: account.displayPhoneNumber || "",
          phoneNumberId: account.phoneNumberId || "",
          wabaId: account.wabaId || "",
          connectedAt: account.createdAt || null,
          updatedAt: account.updatedAt || null,
        }
      : null,
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

  const result = await db.collection("whatsappAccounts").updateMany(
    { workspaceId, status: "connected" },
    {
      $set: {
        status: "disconnected",
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      },
      $unset: { accessTokenEncrypted: "" },
    },
  );

  return NextResponse.json({
    success: true,
    disconnected: result.modifiedCount > 0,
    message: result.modifiedCount
      ? "WhatsApp was disconnected from this workspace. Revoke the system-user token in Meta if you no longer need it."
      : "No connected WhatsApp account was found.",
  });
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
    const replaceExisting = body.replaceExisting === true;

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

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const now = new Date();
    const existingAccount = await db.collection("whatsappAccounts").findOne({
      workspaceId,
      status: "connected",
    });
    const replacingDifferentNumber = Boolean(
      existingAccount && existingAccount.phoneNumberId !== phoneNumberId.trim(),
    );

    if (replacingDifferentNumber && !replaceExisting) {
      return NextResponse.json(
        {
          success: false,
          code: "REPLACEMENT_CONFIRMATION_REQUIRED",
          message: "A different WhatsApp number is already connected. Confirm replacement before continuing.",
        },
        { status: 409 },
      );
    }

    if (replacingDifferentNumber) {
      const activeCampaign = await db.collection("campaigns").findOne({
        workspaceId,
        status: { $in: ["queued", "sending"] },
      });
      if (activeCampaign) {
        return NextResponse.json(
          {
            success: false,
            message: "Pause or finish active campaigns before replacing the connected number.",
          },
          { status: 409 },
        );
      }
    }

    // Disconnect any other number in this workspace.
    await db.collection("whatsappAccounts").updateMany(
      {
        workspaceId,
        status: "connected",
        phoneNumberId: { $ne: phoneNumberId.trim() },
      },
      {
        $set: {
          status: "disconnected",
          updatedAt: now,
        },
      },
    );

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
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
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
