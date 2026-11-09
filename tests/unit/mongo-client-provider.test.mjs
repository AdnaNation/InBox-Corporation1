import assert from "node:assert/strict";
import test from "node:test";
import { createMongoClientProvider } from "../../src/lib/mongo-client-provider.mjs";

test("does not open a MongoDB connection until the provider is called", async () => {
  let connectCalls = 0;
  class FakeClient {
    constructor(uri, options) {
      this.uri = uri;
      this.options = options;
    }
    async connect() {
      connectCalls += 1;
      return this;
    }
    async close() {}
  }

  const state = {};
  const getClient = createMongoClientProvider({
    MongoClient: FakeClient,
    uri: "mongodb://localhost/test",
    options: { maxPoolSize: 5 },
    state,
  });

  assert.equal(connectCalls, 0);
  const client = await getClient();
  assert.equal(connectCalls, 1);
  assert.equal(client.uri, "mongodb://localhost/test");
});

test("reuses the same connection promise for concurrent and later requests", async () => {
  let connectCalls = 0;
  let resolveConnect;
  class FakeClient {
    async connect() {
      connectCalls += 1;
      await new Promise((resolve) => { resolveConnect = resolve; });
      return this;
    }
    async close() {}
  }

  const getClient = createMongoClientProvider({
    MongoClient: FakeClient,
    uri: "mongodb://localhost/test",
    state: {},
  });

  const first = getClient();
  const second = getClient();
  assert.equal(connectCalls, 1);
  resolveConnect();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, b);
  assert.equal(await getClient(), a);
  assert.equal(connectCalls, 1);
});

test("cleans up a failed client and allows the next request to reconnect", async () => {
  let connectCalls = 0;
  let closeCalls = 0;
  class FakeClient {
    async connect() {
      connectCalls += 1;
      if (connectCalls === 1) throw new Error("temporary connection failure");
      return this;
    }
    async close() {
      closeCalls += 1;
    }
  }

  const state = {};
  const getClient = createMongoClientProvider({
    MongoClient: FakeClient,
    uri: "mongodb://localhost/test",
    state,
  });

  await assert.rejects(getClient(), /temporary connection failure/);
  assert.equal(closeCalls, 1);
  const client = await getClient();
  assert.ok(client);
  assert.equal(connectCalls, 2);
});

test("requires a MongoDB URI", () => {
  assert.throws(() => createMongoClientProvider({ MongoClient: class {} }), /MONGODB_URI/);
});
