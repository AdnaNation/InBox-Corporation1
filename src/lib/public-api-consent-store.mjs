import { ObjectId } from "mongodb";
import { ensureContactSuppressionIndex } from "./contact-suppression.mjs";

export async function applyPublicApiConsent(db, {
  workspaceId,
  contactId,
  apiKey,
  consent,
}) {
  await ensureContactSuppressionIndex(db);

  const contact = await db.collection("contacts").findOne(
    { _id: contactId, workspaceId },
    { projection: { phone: 1, optIn: 1 } },
  );
  if (!contact) return null;

  const now = new Date();
  const apiKeyId = apiKey._id instanceof ObjectId ? apiKey._id : new ObjectId(apiKey._id);
  const actorUserId = apiKey.createdBy
    ? (apiKey.createdBy instanceof ObjectId ? apiKey.createdBy : new ObjectId(apiKey.createdBy))
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
    // Record fresh consent before clearing durable suppression. If the
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

  return {
    contactId: contactId.toString(),
    action: consent.action,
    optedIn: consent.action === "opt_in",
    suppressed: consent.action === "opt_out",
    updatedAt: now,
  };
}
