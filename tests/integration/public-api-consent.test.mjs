import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { applyPublicApiConsent } from "../../src/lib/public-api-consent-store.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run public API consent integration tests.");

const client = new MongoClient(mongoUri);
let db;
const workspaceId = new ObjectId();
const contactId = new ObjectId();
const apiKey = { _id: new ObjectId(), createdBy: new ObjectId() };
const phone = "8801712345678";

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
  await db.collection("contacts").insertOne({
    _id: contactId,
    workspaceId,
    name: "Consent Test Contact",
    phone,
    optIn: { status: true, source: "website_form" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

after(async () => {
  if (db) {
    await Promise.all([
      db.collection("contacts").deleteMany({ _id: contactId, workspaceId }),
      db.collection("contactSuppressions").deleteMany({ workspaceId, phone }),
      db.collection("workspaceAuditLogs").deleteMany({ workspaceId, entityId: contactId }),
    ]);
  }
  await client.close();
});

test("public API opt-out revokes contact consent and creates durable suppression", async () => {
  const result = await applyPublicApiConsent(db, {
    workspaceId,
    contactId,
    apiKey,
    consent: { action: "opt_out", source: "customer_request", evidence: "Customer requested no more updates." },
  });

  assert.equal(result.optedIn, false);
  assert.equal(result.suppressed, true);

  const contact = await db.collection("contacts").findOne({ _id: contactId, workspaceId });
  const suppression = await db.collection("contactSuppressions").findOne({ workspaceId, phone, active: true });
  const audit = await db.collection("workspaceAuditLogs").findOne({ workspaceId, entityId: contactId, action: "contact.opted_out_via_api" });

  assert.equal(contact.optIn.status, false);
  assert.equal(contact.optIn.revocationSource, "public_api:customer_request");
  assert.ok(suppression);
  assert.ok(audit);
  assert.equal(audit.actorType, "api_key");
  assert.equal(audit.actorApiKeyId.toString(), apiKey._id.toString());
});

test("public API fresh opt-in records evidence and clears durable suppression", async () => {
  const result = await applyPublicApiConsent(db, {
    workspaceId,
    contactId,
    apiKey,
    consent: {
      action: "opt_in",
      source: "website_form",
      evidence: "Checked the WhatsApp consent box on the updated signup form.",
    },
  });

  assert.equal(result.optedIn, true);
  assert.equal(result.suppressed, false);

  const contact = await db.collection("contacts").findOne({ _id: contactId, workspaceId });
  const suppression = await db.collection("contactSuppressions").findOne({ workspaceId, phone });
  const audit = await db.collection("workspaceAuditLogs").findOne({ workspaceId, entityId: contactId, action: "contact.consent_reinstated_via_api" });

  assert.equal(contact.optIn.status, true);
  assert.equal(contact.optIn.consentSource, "website_form");
  assert.equal(contact.optIn.evidence, "Checked the WhatsApp consent box on the updated signup form.");
  assert.equal(contact.optIn.revokedAt, undefined);
  assert.equal(suppression.active, false);
  assert.ok(audit);
});

test("does not expose a contact from another workspace", async () => {
  const result = await applyPublicApiConsent(db, {
    workspaceId: new ObjectId(),
    contactId,
    apiKey,
    consent: { action: "opt_out", source: "customer_request", evidence: "" },
  });

  assert.equal(result, null);
});
