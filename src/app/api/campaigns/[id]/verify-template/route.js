import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getActiveWhatsAppAccount } from "@/lib/whatsapp-account";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid request origin." },
      { status: 403 },
    );
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign ID." },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const campaignId = new ObjectId(id);

    const campaign = await db.collection("campaigns").findOne({
      _id: campaignId,
      workspaceId,
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, message: "Campaign not found." },
        { status: 404 },
      );
    }

    if (campaign.status !== "draft") {
      return NextResponse.json(
        {
          success: false,
          message: "Only draft campaigns can be verified.",
        },
        { status: 409 },
      );
    }

    const templateName = campaign.template?.name;
    const templateLanguage = campaign.template?.language;

    if (!templateName || !templateLanguage) {
      return NextResponse.json(
        { success: false, message: "Campaign template is missing." },
        { status: 400 },
      );
    }

    const account = await getActiveWhatsAppAccount(db, workspaceId);

    if (!account) {
      return NextResponse.json(
        {
          success: false,
          message: "No connected WhatsApp account found.",
        },
        { status: 404 },
      );
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v22.0";

    const url = new URL(
      `https://graph.facebook.com/${apiVersion}/${account.wabaId}/message_templates`,
    );

    url.searchParams.set("name", templateName);
    url.searchParams.set(
      "fields",
      "id,name,status,language,category,parameter_format,components",
    );
    url.searchParams.set("limit", "100");

    const metaResponse = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta template verification error:", metaResult);

      return NextResponse.json(
        {
          success: false,
          message:
            metaResult?.error?.message ||
            "Meta could not verify this template.",
          errorCode: metaResult?.error?.code || null,
        },
        { status: 502 },
      );
    }

    // Require an exact name AND language match.
    const matchedTemplate = (metaResult.data || []).find(
      (item) =>
        item.name === templateName && item.language === templateLanguage,
    );

    if (!matchedTemplate) {
      const message =
        "This template name and language were not found in your connected WhatsApp Business Account.";

      await db.collection("campaigns").updateOne(
        {
          _id: campaignId,
          workspaceId,
          status: "draft",
        },
        {
          $set: {
            templateVerification: "not_found",
            templateVerificationMessage: message,
            templateVerifiedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      return NextResponse.json({
        success: true,
        verified: false,
        verification: "not_found",
        message,
      });
    }

    const bodyComponent = (matchedTemplate.components || []).find((component) => component.type === "BODY");
    const bodyVariableCount = new Set((bodyComponent?.text || "").match(/\{\{\d+\}\}/g) || []).size;

    const metaStatus = String(matchedTemplate.status || "").toUpperCase();

    let verification = "unavailable";
    let message = "This template is not currently available for sending.";

    if (metaStatus === "APPROVED") {
      verification = "approved";
      message = "Meta confirms that this template is approved.";
    } else if (metaStatus === "PENDING") {
      verification = "pending";
      message = "This template is still waiting for Meta approval.";
    } else if (metaStatus === "REJECTED") {
      verification = "rejected";
      message = "Meta rejected this template. It cannot be used.";
    } else if (metaStatus === "PAUSED" || metaStatus === "DISABLED") {
      verification = "unavailable";
      message = `Meta reports this template as ${metaStatus.toLowerCase()}.`;
    }

    await db.collection("campaigns").updateOne(
      {
        _id: campaignId,
        workspaceId,
        status: "draft",
      },
      {
        $set: {
          template: {
            ...campaign.template,
            id: matchedTemplate.id || null,
            category: matchedTemplate.category || null,
            status: metaStatus,
            parameterFormat: matchedTemplate.parameter_format || null,
            bodyVariableCount,
          },
          templateVerification: verification,
          templateVerificationMessage: message,
          templateVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );

    return NextResponse.json({
      success: true,
      verified: verification === "approved",
      verification,
      message,
      template: {
        id: matchedTemplate.id,
        name: matchedTemplate.name,
        language: matchedTemplate.language,
        status: metaStatus,
        category: matchedTemplate.category || null,
        bodyVariableCount,
      },
    });
  } catch (error) {
    console.error("Campaign template verification error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Could not verify the campaign template.",
      },
      { status: 500 },
    );
  }
}
