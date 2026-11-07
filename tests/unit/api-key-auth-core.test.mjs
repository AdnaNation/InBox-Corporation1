import assert from "node:assert/strict";
import test from "node:test";
import { authenticateApiKeyWithDb, hashApiKey } from "../../src/lib/api-key-auth-core.mjs";

const token = "ibx_live_" + "a".repeat(43);
const workspaceId = { toString: () => "workspace-1" };
const apiKeyId = { toString: () => "api-key-1" };

function createDb(workspace) {
  const calls = { rateLimit: 0, lastUsed: 0 };
  const apiKey = {
    _id: apiKeyId,
    workspaceId,
    keyHash: hashApiKey(token),
    status: "active",
    scopes: ["contacts:read"],
  };
  const collections = {
    apiKeys: {
      findOne: async (query) => query.keyHash === apiKey.keyHash ? apiKey : null,
      updateOne: async () => { calls.lastUsed++; return { modifiedCount: 1 }; },
    },
    workspaces: {
      findOne: async (query) => query._id === workspaceId && query.status === "active" && workspace?.status === "active"
        ? { _id: workspaceId }
        : null,
    },
    apiRateLimits: {
      createIndex: async () => "api_rate_limits_ttl",
      findOneAndUpdate: async () => {
        calls.rateLimit++;
        return { value: { count: 1 } };
      },
    },
  };
  const db = {
    client: {},
    databaseName: "api-key-auth-test",
    collection: (name) => collections[name],
  };
  return { db, calls, apiKey };
}

function requestWithToken(value = token) {
  return new Request("https://wavo.example.com/api/v1/contacts", {
    headers: { Authorization: "Bearer " + value },
  });
}

test("allows a scoped API key when its workspace is active", async () => {
  const { db, calls, apiKey } = createDb({ status: "active" });
  const result = await authenticateApiKeyWithDb(requestWithToken(), "contacts:read", async () => db);

  assert.deepEqual(result, { apiKey });
  assert.equal(calls.rateLimit, 1);
  assert.equal(calls.lastUsed, 1);
});

test("blocks API keys immediately when their workspace is suspended", async () => {
  const { db, calls } = createDb({ status: "suspended" });
  const result = await authenticateApiKeyWithDb(requestWithToken(), "contacts:read", async () => db);

  assert.equal(result.status, 403);
  assert.match(result.error, /inactive or suspended/);
  assert.equal(calls.rateLimit, 0);
  assert.equal(calls.lastUsed, 0);
});

test("blocks API keys when their workspace no longer exists", async () => {
  const { db, calls } = createDb(null);
  const result = await authenticateApiKeyWithDb(requestWithToken(), "contacts:read", async () => db);

  assert.equal(result.status, 403);
  assert.equal(calls.rateLimit, 0);
  assert.equal(calls.lastUsed, 0);
});

test("does not let a workspace suspension bypass API-key scope checks", async () => {
  const { db, calls } = createDb({ status: "active" });
  const result = await authenticateApiKeyWithDb(requestWithToken(), "contacts:write", async () => db);

  assert.equal(result.status, 403);
  assert.match(result.error, /contacts:write/);
  assert.equal(calls.rateLimit, 0);
  assert.equal(calls.lastUsed, 0);
});

test("rejects malformed bearer credentials before database access", async () => {
  let databaseCalls = 0;
  const result = await authenticateApiKeyWithDb(
    requestWithToken("not-a-key"),
    "contacts:read",
    async () => { databaseCalls++; throw new Error("must not connect"); },
  );

  assert.equal(result.status, 401);
  assert.equal(databaseCalls, 0);
});
