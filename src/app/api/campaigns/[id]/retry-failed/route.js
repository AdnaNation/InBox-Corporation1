import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    if (!["owner", "admin"].includes(session.membership?.role)) {
      return NextResponse.json({ success: false, message: "Only workspace owners and admins can retry failed recipients." }, { status: 403 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid campaign ID." }, { status: 400 });

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const campaignId = new ObjectId(id);
    const campaign = await db.collection("campaigns").findOne({
      _id: campaignId,
      workspaceId,
      status: "completed_with_issues",
    });

    if (!campaign) {
      return NextResponse.json({ success: false, message: "Only completed campaigns with issues can retry failed recipients." }, { status: 409 });
    }

    const failedCount = await db.collection("campaignRecipients").countDocuments({
      workspaceId, campaignId, status: "failed",
    });
    if (!failedCount) {
      return NextResponse.json({ success: false, message: "There are no failed recipients to retry." }, { status: 409 });
    }

    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account?.wabaId || !account?.phoneNumberId || !account?.accessTokenEncrypted) {
      return NextResponse.json({ success: false, message: "Reconnect a WhatsApp Business Account before retrying." }, { status: 400 });
    }

    const parameters = campaign.bodyParameters || [];
    if (!Array.isArray(parameters) || !parameters.every((value) => typeof value === "string" && value.trim() && value.length <= 1024)) {
      return NextResponse.json({ success: false, message: "Campaign template parameters are incomplete or invalid." }, { status: 400 });
    }

    const token = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v22.0";
    const templatesUrl = new URL("https://graph.facebook.com/" + version + "/" + account.wabaId + "/message_templates");
    templatesUrl.searchParams.set("name", campaign.template?.name || "");
    templatesUrl.searchParams.set("fields", "id,name,status,language,components,parameter_format,category");
    templatesUrl.searchParams.set("limit", "100");

    const metaResponse = await fetch(templatesUrl, {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const metaData = await metaResponse.json();
    if (!metaResponse.ok) {
      console.error("Retry template verification failed:", metaData);
      return NextResponse.json({ success: false, message: metaData?.error?.message || "Meta could not verify the campaign template. Nothing was retried." }, { status: 502 });
    }

    const template = (metaData.data || []).find((item) =>
      item.name === campaign.template?.name && item.language === campaign.template?.language
    );
    if (!template || String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json({ success: false, message: "The exact campaign template and language are not currently approved by Meta." }, { status: 409 });
    }

    const templateBody = (template.components || []).find((item) => item.type === "BODY");
    const variableCount = new Set((templateBody?.text || "").match(/\{\{\d+\}\}/g) || []).size;
    if (variableCount !== parameters.length) {
      return NextResponse.json({ success: false, message: "The template parameter count has changed. Edit the campaign before retrying." }, { status: 409 });
    }

    const retryBatchId = randomUUID();
    const now = new Date();
    const reset = await db.collection("campaignRecipients").updateMany(
      { workspaceId, campaignId, status: "failed" },
      [
        { $set: {
          lastError: "$error",
          status: "pending",
          retryBatchId,
          retryQueuedAt: now,
          retryCount: { $add: [{ $ifNull: ["$retryCount", 0] }, 1] },
          updatedAt: now,
        } },
        { $unset: "error" },
      ],
    );

    if (!reset.modifiedCount) {
      return NextResponse.json({ success: false, message: "No failed recipients remained to retry. Refresh the campaign." }, { status: 409 });
    }

    const queued = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: "completed_with_issues" },
      {
        $set: {
          status: "queued",
          retryQueuedAt: now,
          retryQueuedBy: new ObjectId(session.user.id),
          retryBatchId,
          templateVerification: "approved",
          templateVerificationMessage: "Rechecked and approved by Meta before retrying failed recipients.",
          template: {
            ...campaign.template,
            id: template.id || null,
            status: "APPROVED",
            category: template.category || null,
            parameterFormat: template.parameter_format || null,
            bodyVariableCount: variableCount,
          },
          updatedAt: now,
        },
        $inc: { queueVersion: 1 },
        $unset: { completedAt: "", pauseReason: "" },
      },
    );

    if (!queued.modifiedCount) {
      await db.collection("campaignRecipients").updateMany(
        { workspaceId, campaignId, status: "pending", retryBatchId },
        [
          { $set: { status: "failed", error: "$lastError", updatedAt: new Date() } },
          { $unset: ["lastError", "retryBatchId", "retryQueuedAt"] },
        ],
      );
      return NextResponse.json({ success: false, message: "Campaign state changed during retry preparation. Refresh and try again." }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      message: "Meta re-approved the template. " + reset.modifiedCount + " failed recipient(s) have been queued for retry. Previously accepted, delivered, read, skipped, and unknown recipients were not changed.",
      retried: reset.modifiedCount,
      status: "queued",
    });
  } catch (error) {
    console.error("Retry failed campaign recipients error:", error);
    return NextResponse.json({ success: false, message: "Could not prepare failed recipients for retry." }, { status: 500 });
  }
}
