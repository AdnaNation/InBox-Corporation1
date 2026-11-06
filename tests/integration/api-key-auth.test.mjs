import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoClient, ObjectId } from "mongodb";
import { authenticateApiKeyWithDb, hashApiKey } from "../../src/lib/api-key-auth-core.mjs";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI is required to run public API integration tests.");
}

const client = new MongoClient(mongoUri);
let db;
const testKeys = [];

before(async () => {
  await client.connect();
  db = client.db("whatsapp_saas");
});

after(async () => {
  if (db && testKeys.length) {
    const ids = testKeys.map((key) => key.id);
    await db.collection("apiKeys").deleteMany({ _id: { $in: ids } });
    await db.collection("apiRateLimits").deleteMany({
      _id: { $regex: `^(?:${ids.map((id) => id.toString()).join("|")}):` },
    });
  }
  await client.close();
});

async function createKey({ scopes = ["contacts:read"], status = "active", revokedAt, expiresAt } = {}) {
  const id = new ObjectId();
  const secret = `ibx_live_${id.toString()}_integration_test`;
  const document = {
    _id: id,
    workspaceId: new ObjectId(),
    keyHash: hashApiKey(secret),
    name: "Integration test key",
    scopes,
    status,
    createdAt: new Date(),
    ...(revokedAt ? { revokedAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
  await db.collection("apiKeys").insertOne(document);
  testKeys.push({ id, secret });
  return { id, secret };
}

function requestFor(secret) {
  return new Request("http://localhost/api/v1/contacts", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

test("rejects malformed, expired, revoked, and insufficient-scope API keys", async () => {
  let databaseCalls = 0;
  const unusedDatabase = async () => {
    databaseCalls += 1;
    return db;
  };

  const malformed = await authenticateApiKeyWithDb(
    new Request("http://localhost/api/v1/contacts"),
    "contacts:read",
    unusedDatabase,
  );
  assert.equal(malformed.status, 401);
  assert.equal(databaseCalls, 0);

  const expiredKey = await createKey({ expiresAt: new Date(Date.now() - 60_000) });
  const expired = await authenticateApiKeyWithDb(requestFor(expiredKey.secret), "contacts:read", async () => db);
  assert.equal(expired.status, 401);

  const revokedKey = await createKey({ revokedAt: new Date() });
  const revoked = await authenticateApiKeyWithDb(requestFor(revokedKey.secret), "contacts:read", async () => db);
  assert.equal(revoked.status, 401);

  const readOnlyKey = await createKey({ scopes: ["contacts:read"] });
  const forbidden = await authenticateApiKeyWithDb(requestFor(readOnlyKey.secret), "contacts:write", async () => db);
  assert.equal(forbidden.status, 403);

  const rateLimitForReadOnlyKey = await db.collection("apiRateLimits").findOne({
    _id: { $regex: `^${readOnlyKey.id.toString()}:` },
  });
  assert.equal(rateLimitForReadOnlyKey, null);
});

test("allows messages:send without granting contact writes", async () => {
  const key = await createKey({ scopes: ["messages:send"] });
  const sendPermission = await authenticateApiKeyWithDb(requestFor(key.secret), "messages:send", async () => db);
  assert.equal(sendPermission.error, undefined);
  const contactWrite = await authenticateApiKeyWithDb(requestFor(key.secret), "contacts:write", async () => db);
  assert.equal(contactWrite.status, 403);
});

test("allows messages:read without granting message sending", async () => {
  const key = await createKey({ scopes: ["messages:read"] });
  const readPermission = await authenticateApiKeyWithDb(requestFor(key.secret), "messages:read", async () => db);
  assert.equal(readPermission.error, undefined);
  const sendPermission = await authenticateApiKeyWithDb(requestFor(key.secret), "messages:send", async () => db);
  assert.equal(sendPermission.status, 403);
});

test("allows templates:read without granting message sending", async () => {
  const key = await createKey({ scopes: ["templates:read"] });
  const readPermission = await authenticateApiKeyWithDb(requestFor(key.secret), "templates:read", async () => db);
  assert.equal(readPermission.error, undefined);
  const sendPermission = await authenticateApiKeyWithDb(requestFor(key.secret), "messages:send", async () => db);
  assert.equal(sendPermission.status, 403);
});

test("authenticates a valid scoped key and records last use", async () => {
  const key = await createKey({ scopes: ["contacts:read", "contacts:write"] });
  const result = await authenticateApiKeyWithDb(requestFor(key.secret), "contacts:write", async () => db);

  assert.equal(result.error, undefined);
  assert.equal(result.apiKey._id.toString(), key.id.toString());

  const storedKey = await db.collection("apiKeys").findOne({ _id: key.id });
  assert.ok(storedKey.lastUsedAt instanceof Date);

  const counter = await db.collection("apiRateLimits").findOne({
    _id: { $regex: `^${key.id.toString()}:` },
  });
  assert.equal(counter.count, 1);
});


test("keeps campaign read and write permissions separate", async () => {
  const readKey = await createKey({ scopes: ["campaigns:read"] });
  const readPermission = await authenticateApiKeyWithDb(requestFor(readKey.secret), "campaigns:read", async () => db);
  assert.equal(readPermission.error, undefined);
  const readCannotWrite = await authenticateApiKeyWithDb(requestFor(readKey.secret), "campaigns:write", async () => db);
  assert.equal(readCannotWrite.status, 403);

  const writeKey = await createKey({ scopes: ["campaigns:write"] });
  const writePermission = await authenticateApiKeyWithDb(requestFor(writeKey.secret), "campaigns:write", async () => db);
  assert.equal(writePermission.error, undefined);
  const writeCannotRead = await authenticateApiKeyWithDb(requestFor(writeKey.secret), "campaigns:read", async () => db);
  assert.equal(writeCannotRead.status, 403);
});
