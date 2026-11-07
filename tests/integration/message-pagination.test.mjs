import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { decodeMessageCursor, encodeMessageCursor } from "../../src/lib/message-pagination.mjs";

test("message pagination cursor round-trips timestamp and ObjectId", () => {
  const message = {
    _id: new ObjectId("66a000000000000000000001"),
    timestamp: new Date("2026-11-07T06:00:00.000Z"),
  };
  const decoded = decodeMessageCursor(encodeMessageCursor(message));
  assert.ok(decoded.id.equals(message._id));
  assert.equal(decoded.timestamp.toISOString(), message.timestamp.toISOString());
});

test("message pagination cursor rejects malformed, oversized, and invalid values", () => {
  assert.equal(decodeMessageCursor("not-a-cursor"), null);
  assert.equal(decodeMessageCursor("a".repeat(513)), null);
  assert.equal(decodeMessageCursor(Buffer.from(JSON.stringify({ id: "invalid", timestamp: "2026-11-07" })).toString("base64url")), null);
  assert.equal(decodeMessageCursor(Buffer.from(JSON.stringify({ id: "66a000000000000000000001", timestamp: "invalid" })).toString("base64url")), null);
});

test("message pagination cursor encoder rejects missing IDs or timestamps", () => {
  assert.throws(() => encodeMessageCursor({ timestamp: new Date() }), /ID and valid timestamp/);
  assert.throws(() => encodeMessageCursor({ _id: new ObjectId(), timestamp: "invalid" }), /ID and valid timestamp/);
});
