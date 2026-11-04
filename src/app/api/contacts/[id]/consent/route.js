import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

const CONSENT_SOURCES = new Set([
  "website_form",
  "paper_form",
  "verbal",
  "whatsapp_initiated",
  "other",
]);

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid origin." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can record renewed consent." }, { status: 403 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid contact ID." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source : "";
  const evidence = typeof body.evidence === "string" ? body.evidence.trim() : "";
  const confirmed = body.confirmed === true;

  if (!CONSENT_SOURCES.has(source) || evidence.length < 8 || evidence.length > 500 || !confirmed) {
    return NextResponse.json({
      success: false,
      message: "Choose a consent source, provide at least 8 characters describing the evidence, and confirm that fresh consent was received after the opt-out.",
    }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const contactId = new ObjectId(id);
  const now = new Date();

  const contact = await db.collection("contacts").findOne({ _id: contactId, workspaceId });
  if (!contact) {
    return NextResponse.json({ success: false, message: "Contact not found." }, { status: 404 });
  }

  const suppression = await db.collection("contactSuppressions").findOne({ workspaceId, phone: contact.phone });
  if (!suppression && contact.optIn?.status === true) {
    return NextResponse.json({ success: false, message: "This contact is already opted in." }, { status: 409 });
  }

  const update = await db.collection("contacts").updateOne(
    { _id: contactId, workspaceId, "optIn.status": { $ne: true } },
    {
      $set: {
        "optIn.status": true,
        "optIn.source": "documented_reconsent",
        "optIn.consentSource": source,
        "optIn.evidence": evidence,
        "optIn.date": now,
        "optIn.recordedBy": new ObjectId(session.user.id),
        "optIn.reinstatedAt": now,
        updatedAt: now,
      },
      $unset: {
        "optIn.revokedAt": "",
        "optIn.revocationSource": "",
        "optIn.revocationMessageId": "",
      },
    },
  );

  if (!update.modifiedCount) {
    return NextResponse.json({ success: false, message: "Contact consent could not be updated. Refresh and try again." }, { status: 409 });
  }

  if (suppression) {
    await db.collection("contactSuppressions").updateOne(
      { _id: suppression._id, workspaceId },
      {
        $set: {
          active: false,
          reinstatedAt: now,
          reinstatedBy: new ObjectId(session.user.id),
          reinstatementSource: source,
          reinstatementEvidence: evidence,
          updatedAt: now,
        },
      },
    );
  }

  await db.collection("workspaceAuditLogs").insertOne({
    workspaceId,
    actorUserId: new ObjectId(session.user.id),
    action: "contact.consent_reinstated",
    entityType: "contact",
    entityId: contactId,
    metadata: {
      phone: contact.phone,
      consentSource: source,
      evidence,
      previousOptOutAt: suppression?.optedOutAt || contact.optIn?.revokedAt || null,
    },
    createdAt: now,
  });

  return NextResponse.json({
    success: true,
    message: "Fresh consent recorded. The contact can receive eligible WhatsApp campaigns again.",
    optedIn: true,
  });
}
