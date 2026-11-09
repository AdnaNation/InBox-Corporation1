import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { ensureContactSuppressionIndex } from "@/lib/contact-suppression.mjs";
import { validatePublicApiConsentRequest } from "@/lib/public-api-consent.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "contacts:write");
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      {
        status: auth.status,
        headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
      },
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) {
    return NextResponse.json({ success: false, message: "A valid contact ID is required." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }

  const consent = validatePublicApiConsentRequest(body);
  if (consent.error) {
    return NextResponse.json({ success: false, message: consent.error }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    await ensureContactSuppressionIndex(db);

    const workspaceId = new ObjectId(auth.apiKey.workspaceId);
    const contactId = new ObjectId(id);
    const contact = await db.collection("contacts").findOne(
      { _id: contactId, workspaceId },
      { projection: { phone: 1, optIn: 1 } },
    );

    if (!contact) {
      return NextResponse.json({ success: false, message: "Contact not found in this workspace." }, { status: 404 });
    }

    const now = new Date();
    const apiKeyId = new ObjectId(auth.apiKey._id);
    const actorUserId = auth.apiKey.createdBy
      ? new ObjectId(auth.apiKey.createdBy)
      : null;

    if (consent.action === "opt_out") {
      // Revoke contact-level consent first. Even if the suppression write
      // fails, all Wavo send paths reject contacts whose opt-in is false.
      await db.collection("contacts").updateOne(
        { _id: contactId, workspaceId },
        {
          $set: {
            "optIn.status": false,
            "optIn.revokedAt": now,
            "optIn.revocationSource": "public_api:" + consent.source,
            "optIn.revocationEvidence": consent.evidence || null,
            "optIn.revocationApiKeyId": apiKeyId,
            updatedAt: now,
          },
        },
      );

      await db.collection("contactSuppressions").updateOne(
        { workspaceId, phone: contact.phone },
        {
          $setOnInsert: {
            workspaceId,
            phone: contact.phone,
            createdAt: now,
          },
          $set: {
            active: true,
            reason: "public_api_opt_out",
            source: consent.source,
            evidence: consent.evidence || null,
            optedOutAt: now,
            lastOptOutApiKeyId: apiKeyId,
            updatedAt: now,
          },
        },
        { upsert: true },
      );
    } else {
      // Record fresh consent before clearing the durable suppression. If the
      // second write fails, the active suppression still blocks delivery.
      await db.collection("contacts").updateOne(
        { _id: contactId, workspaceId },
        {
          $set: {
            "optIn.status": true,
            "optIn.source": "documented_reconsent",
            "optIn.consentSource": consent.source,
            "optIn.evidence": consent.evidence,
            "optIn.date": now,
            "optIn.recordedByApiKeyId": apiKeyId,
            "optIn.reinstatedAt": now,
            updatedAt: now,
          },
          $unset: {
            "optIn.revokedAt": "",
            "optIn.revocationSource": "",
            "optIn.revocationMessageId": "",
            "optIn.revocationEvidence": "",
            "optIn.revocationApiKeyId": "",
          },
        },
      );

      await db.collection("contactSuppressions").updateMany(
        { workspaceId, phone: contact.phone, active: { $ne: false } },
        {
          $set: {
            active: false,
            reinstatedAt: now,
            reinstatedByApiKeyId: apiKeyId,
            reinstatementSource: consent.source,
            reinstatementEvidence: consent.evidence,
            updatedAt: now,
          },
        },
      );
    }

    await db.collection("workspaceAuditLogs").insertOne({
      workspaceId,
      ...(actorUserId ? { actorUserId } : {}),
      actorApiKeyId: apiKeyId,
      actorType: "api_key",
      action: consent.action === "opt_out" ? "contact.opted_out_via_api" : "contact.consent_reinstated_via_api",
      entityType: "contact",
      entityId: contactId,
      metadata: {
        phone: contact.phone,
        source: consent.source,
        evidence: consent.evidence || null,
        previousOptInStatus: contact.optIn?.status === true,
      },
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      data: {
        contactId: id,
        action: consent.action,
        optedIn: consent.action === "opt_in",
        suppressed: consent.action === "opt_out",
        updatedAt: now,
      },
      message: consent.action === "opt_out"
        ? "Opt-out recorded. This phone number is suppressed from future WhatsApp sends."
        : "Fresh consent recorded and the suppression has been cleared. The contact may receive eligible WhatsApp messages again.",
    });
  } catch (error) {
    console.error("Public API contact consent update failed:", error);
    return NextResponse.json(
      { success: false, message: "Could not complete the consent update. Check the contact's consent status before retrying." },
      { status: 503 },
    );
  }
}
