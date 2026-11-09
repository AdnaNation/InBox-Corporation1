import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { test } from "node:test";
import { buildMessageHistoryFilter } from "../../src/lib/whatsapp-message-pagination.mjs";

test("keeps the base conversation filter when no history cursor is supplied", () => {
  const baseFilter = {
    workspaceId: new ObjectId("64b000000000000000000001"),
    conversationId: new ObjectId("64b000000000000000000002"),
  };
  const result = buildMessageHistoryFilter(baseFilter);
  assert.equal(result.valid, true);
  assert.deepEqual(result.filter, baseFilter);
});

test("builds a stable timestamp and ObjectId cursor for older messages", () => {
  const baseFilter = {
    workspaceId: new ObjectId("64b000000000000000000001"),
    conversationId: new ObjectId("64b000000000000000000002"),
  };
  const timestamp = "2026-11-09T08:00:00.000Z";
  const messageId = "64b000000000000000000003";
  const result = buildMessageHistoryFilter(baseFilter, {
    beforeTimestamp: timestamp,
    beforeId: messageId,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.filter.$or, [
    { timestamp: { $lt: new Date(timestamp) } },
    { timestamp: new Date(timestamp), _id: { $lt: new ObjectId(messageId) } },
  ]);
});

test("rejects incomplete or malformed history cursors", () => {
  const baseFilter = { conversationId: new ObjectId() };
  assert.equal(buildMessageHistoryFilter(baseFilter, { beforeId: "64b000000000000000000003" }).valid, false);
  assert.equal(buildMessageHistoryFilter(baseFilter, { beforeTimestamp: "not-a-date", beforeId: "64b000000000000000000003" }).valid, false);
  assert.equal(buildMessageHistoryFilter(baseFilter, { beforeTimestamp: "2026-11-09T08:00:00.000Z", beforeId: "invalid" }).valid, false);
});
