import test from "node:test";
import assert from "node:assert/strict";
import { buildContactQueryFilter, decodeContactCursor, encodeContactCursor, escapeContactSearchQuery } from "../../src/lib/contact-pagination.mjs";
import { ObjectId } from "mongodb";

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


test("contact search escaping handles every regex metacharacter literally", () => {
  assert.equal(escapeContactSearchQuery(".*+?^${}()|[]\\\\\\\"), "\\\\.\\\\*\\\\+\\\\?\\\\^\\\\$\\\\{\\\\}\\\\(\\\\)\\\\|\\\\[\\\\]\\\\\\\\");
});

test("contact search escapes regex input and matches phone digits separately", () => {
  const workspaceId = new ObjectId("66a000000000000000000001");
  const filter = buildContactQueryFilter(workspaceId, { query: "+880 17.*", tag: "VIP" });
  assert.deepEqual(filter.$and[0], { workspaceId });
  assert.equal(filter.$and[1].$or[0].name.$options, "i");
  assert.equal(filter.$and[1].$or[0].name.$regex, "\\+880 17\\.\\*");
  assert.equal(filter.$and[1].$or[1].phone.$regex, "88017");
  assert.deepEqual(filter.$and[2], { tags: "vip" });
});

test("contact search combines cursor and query conditions without replacing either", () => {
  const workspaceId = new ObjectId("66a000000000000000000001");
  const cursor = { id: "66a000000000000000000002", createdAt: new Date("2026-11-07T05:00:00.000Z") };
  const filter = buildContactQueryFilter(workspaceId, { cursor, query: "Adnan" });
  assert.equal(filter.$and.length, 2);
  assert.equal(filter.$and[0].$or.length, 2);
  assert.equal(filter.$and[1].$or[0].name.$regex, "Adnan");
});
