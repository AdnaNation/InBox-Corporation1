import test from "node:test";
import assert from "node:assert/strict";
import { decodeContactCursor, encodeContactCursor } from "../../src/lib/contact-pagination.mjs";

test("contact pagination cursor round-trips timestamp and ObjectId", () => {
  const contact = { _id: "66a000000000000000000001", createdAt: new Date("2026-11-07T05:00:00.000Z") };
  const decoded = decodeContactCursor(encodeContactCursor(contact));
  assert.equal(decoded.id, contact._id);
  assert.equal(decoded.createdAt.toISOString(), contact.createdAt.toISOString());
});

test("contact pagination cursor rejects malformed, oversized, and invalid values", () => {
  assert.equal(decodeContactCursor("not-a-cursor"), null);
  assert.equal(decodeContactCursor("a".repeat(513)), null);
  assert.equal(decodeContactCursor(Buffer.from(JSON.stringify({ id: "bad", createdAt: "2026-11-07" })).toString("base64url")), null);
  assert.equal(decodeContactCursor(Buffer.from(JSON.stringify({ id: "66a000000000000000000001", createdAt: "invalid" })).toString("base64url")), null);
});

test("contact pagination cursor encoder rejects missing IDs or timestamps", () => {
  assert.throws(() => encodeContactCursor({ createdAt: new Date() }), /ID and valid createdAt/);
  assert.throws(() => encodeContactCursor({ _id: "66a000000000000000000001", createdAt: "invalid" }), /ID and valid createdAt/);
});
