import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMongoConnectionError } from "../../src/lib/mongo-error-summary.mjs";

test("summarizes server selection failures without logging connection strings or messages", () => {
  const error = {
    name: "MongoServerSelectionError",
    code: "ETIMEDOUT",
    reason: {
      type: "ReplicaSetNoPrimary",
      servers: new Map([
        ["cluster-a.example:27017", {
          type: "Unknown",
          error: { name: "MongoNetworkTimeoutError", code: "ETIMEDOUT", message: "private host detail" },
        }],
        ["cluster-b.example:27017", {
          type: "RSSecondary",
          error: null,
        }],
      ]),
    },
  };

  const summary = summarizeMongoConnectionError(error);
  assert.deepEqual(summary, {
    name: "MongoServerSelectionError",
    code: "ETIMEDOUT",
    causeCode: null,
    topologyType: "ReplicaSetNoPrimary",
    servers: [
      { type: "Unknown", errorName: "MongoNetworkTimeoutError", errorCode: "ETIMEDOUT" },
      { type: "RSSecondary", errorName: null, errorCode: null },
    ],
  });
  assert.equal(JSON.stringify(summary).includes("private host detail"), false);
  assert.equal(JSON.stringify(summary).includes("cluster-a"), false);
});

test("handles ordinary errors without a MongoDB topology description", () => {
  assert.deepEqual(
    summarizeMongoConnectionError(new Error("connection failed")),
    { name: "Error", code: null, causeCode: null, topologyType: null, servers: [] },
  );
});
