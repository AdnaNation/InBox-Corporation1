import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { ensureWhatsAppWebhookIndexes } from "../../src/lib/whatsapp-webhook-indexes.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required to run WhatsApp webhook index integration tests.");

const client = new MongoClient(mongoUri);
const databaseNames = [
  "wavo_webhook_indexes_a_" + new ObjectId().toString(),
  "wavo_webhook_indexes_b_" + new ObjectId().toString(),
];

before(async () => {
  await client.connect();
});

after(async () => {
  await Promise.all(databaseNames.map((name) => client.db(name).dropDatabase()));
  await client.close();
});

test("initializes webhook indexes independently for multiple databases on one client", async () => {
  const databases = databaseNames.map((name) => client.db(name));
  await Promise.all(databases.map((db) => ensureWhatsAppWebhookIndexes(db)));

  for (const db of databases) {
    const contacts = await db.collection("whatsappContacts").listIndexes().toArray();
    const conversations = await db.collection("conversations").listIndexes().toArray();
    const messages = await db.collection("messages").listIndexes().toArray();
    const suppressions = await db.collection("contactSuppressions").listIndexes().toArray();

    assert.ok(contacts.some((index) => index.key?.workspaceId === 1 && index.key?.waId === 1 && index.unique));
    assert.ok(conversations.some((index) =>
      index.key?.workspaceId === 1 && index.key?.phoneNumberId === 1 && index.key?.waId === 1 && index.unique,
    ));
    assert.ok(messages.some((index) => index.key?.workspaceId === 1 && index.key?.waMessageId === 1 && index.unique));
    assert.ok(messages.some((index) =>
      index.key?.workspaceId === 1 && index.key?.conversationId === 1 && index.key?.timestamp === -1,
    ));
    assert.ok(suppressions.some((index) => index.key?.workspaceId === 1 && index.key?.phone === 1));
  }
});

test("reuses the cached initializer for recreated Db handles", async () => {
  const name = databaseNames[0];
  const first = client.db(name);
  const second = client.db(name);
  await Promise.all([
    ensureWhatsAppWebhookIndexes(first),
    ensureWhatsAppWebhookIndexes(second),
  ]);
  const indexes = await first.collection("messages").listIndexes().toArray();
  assert.ok(indexes.some((index) => index.key?.workspaceId === 1 && index.key?.waMessageId === 1));
});
