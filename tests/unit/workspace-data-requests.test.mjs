import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionWorkspaceDataRequest,
  ensureWorkspaceDataRequestIndexes,
  WORKSPACE_DATA_REQUEST_TYPES,
} from "../../src/lib/workspace-data-requests.mjs";

test("accepts only the supported workspace data request types", () => {
  assert.deepEqual(WORKSPACE_DATA_REQUEST_TYPES, ["export", "deletion"]);
});

test("allows only safe, forward-only review transitions", () => {
  assert.equal(canTransitionWorkspaceDataRequest("pending", "in_review"), true);
  assert.equal(canTransitionWorkspaceDataRequest("pending", "rejected"), true);
  assert.equal(canTransitionWorkspaceDataRequest("in_review", "completed"), true);
  assert.equal(canTransitionWorkspaceDataRequest("in_review", "rejected"), true);
  assert.equal(canTransitionWorkspaceDataRequest("pending", "completed"), false);
  assert.equal(canTransitionWorkspaceDataRequest("completed", "rejected"), false);
  assert.equal(canTransitionWorkspaceDataRequest("rejected", "in_review"), false);
  assert.equal(canTransitionWorkspaceDataRequest("unknown", "completed"), false);
});

test("shares index creation across concurrent calls on the same Mongo connection", async () => {
  let calls = 0;
  const connection = {};
  const fakeDb = {
    client: connection,
    collection(name) {
      assert.equal(name, "workspaceDataRequests");
      return {
        async createIndex(keys, options) {
          calls += 1;
          if (calls === 1) {
            assert.deepEqual(keys, { workspaceId: 1, type: 1 });
            assert.equal(options.unique, true);
            assert.deepEqual(options.partialFilterExpression, { active: true });
          } else {
            assert.deepEqual(keys, { workspaceId: 1, createdAt: -1 });
          }
          return options.name;
        },
      };
    },
  };
  const results = await Promise.all([
    ensureWorkspaceDataRequestIndexes(fakeDb),
    ensureWorkspaceDataRequestIndexes(fakeDb),
  ]);
  assert.deepEqual(results, ["one_active_data_request_per_workspace_type", "one_active_data_request_per_workspace_type"]);
  assert.equal(calls, 2);
});

test("retries index setup after a transient failure", async () => {
  let attempts = 0;
  const connection = {};
  const fakeDb = {
    client: connection,
    collection() {
      return {
        async createIndex() {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary index failure");
          return "created";
        },
      };
    },
  };
  await assert.rejects(ensureWorkspaceDataRequestIndexes(fakeDb), /temporary index failure/);
  assert.equal(await ensureWorkspaceDataRequestIndexes(fakeDb), "created");
  assert.equal(attempts, 3);
});
