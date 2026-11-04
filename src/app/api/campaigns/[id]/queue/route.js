import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
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

    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ success: false, message: "Invalid campaign ID." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    let scheduledAt = null;
    if (body.scheduledAt) {
      scheduledAt = new Date(body.scheduledAt);
      const now = Date.now();
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < now + 2 * 60 * 1000 || scheduledAt.getTime() > now + 365 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({ success: false, message: "Choose a schedule at least 2 minutes and no more than 1 year in the future." }, { status: 400 });
      }
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const campaignId = new ObjectId(id);
    const campaign = await db.collection("campaigns").findOne({ _id: campaignId, workspaceId, status: "draft" });

    if (!campaign) return NextResponse.json({ success: false, message: "Draft campaign not found or already queued." }, { status: 404 });

    const recipientCount = await db.collection("campaignRecipients").countDocuments({ workspaceId, campaignId });
    if (!recipientCount || recipientCount !== campaign.recipientCount) {
      return NextResponse.json({ success: false, message: "Recipient snapshot is incomplete. This campaign cannot be queued." }, { status: 409 });
    }

    const parameters = campaign.bodyParameters || [];
    if (!Array.isArray(parameters) || !parameters.every((value) => typeof value === "string" && value.trim().length > 0 && value.length <= 1024)) {
      return NextResponse.json({ success: false, message: "Complete every template body parameter before queueing." }, { status: 400 });
    }

    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account?.wabaId || !account?.phoneNumberId || !account?.accessTokenEncrypted) {
      return NextResponse.json({ success: false, message: "A connected WhatsApp account is required." }, { status: 400 });
    }

    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v22.0";
    const templatesUrl = new URL("https://graph.facebook.com/" + version + "/" + account.wabaId + "/message_templates");
    templatesUrl.searchParams.set("name", campaign.template?.name || "");
    templatesUrl.searchParams.set("fields", "id,name,status,language,components,parameter_format,category");
    templatesUrl.searchParams.set("limit", "100");

    const metaResponse = await fetch(templatesUrl, { headers: { Authorization: "Bearer " + accessToken }, cache: "no-store" });
    const metaData = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Campaign queue template lookup failed:", metaData);
      return NextResponse.json({ success: false, message: metaData?.error?.message || "Meta template verification failed." }, { status: 502 });
    }

    const template = (metaData.data || []).find((item) => item.name === campaign.template?.name && item.language === campaign.template?.language);
    if (!template || String(template.status || "").toUpperCase() !== "APPROVED") {
      return NextResponse.json({ success: false, message: "The exact template and language must currently be approved by Meta." }, { status: 409 });
    }

    const body = (template.components || []).find((item) => item.type === "BODY");
    const variableCount = new Set((body?.text || "").match(/\{\{\d+\}\}/g) || []).size;
    if (variableCount !== parameters.length) {
      return NextResponse.json({ success: false, message: "Meta's current template requires " + variableCount + " body parameter(s); this draft has " + parameters.length + "." }, { status: 409 });
    }

    const now = new Date();
    const updated = await db.collection("campaigns").updateOne(
      { _id: campaignId, workspaceId, status: "draft", recipientCount },
      {
        $set: {
          status: scheduledAt ? "scheduled" : "queued",
          ...(scheduledAt ? { scheduledAt, scheduledBy: new ObjectId(session.user.id) } : {}),
          templateVerification: "approved",
          templateVerificationMessage: "Rechecked and approved by Meta during queue preparation.",
          template: {
            ...campaign.template,
            id: template.id || null,
            status: "APPROVED",
            category: template.category || null,
            parameterFormat: template.parameter_format || null,
            bodyVariableCount: variableCount,
          },
          queuedAt: scheduledAt || now,
          queuedBy: new ObjectId(session.user.id),
          updatedAt: now,
          queueVersion: 1,
        },
      },
    );

    if (!updated.modifiedCount) return NextResponse.json({ success: false, message: "Campaign state changed. Refresh and try again." }, { status: 409 });

    return NextResponse.json({
      success: true,
      message: (scheduledAt ? "Campaign validated and scheduled. It will enter the delivery queue at the selected time." : "Campaign validated and queued. No messages have been sent yet."),
      campaignId: id,
      recipientCount,
      status: scheduledAt ? "scheduled" : "queued",
    });
  } catch (error) {
    console.error("Queue campaign error:", error);
    return NextResponse.json({ success: false, message: "Could not validate and queue this campaign." }, { status: 500 });
  }
}
