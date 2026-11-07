import test from "node:test";
import assert from "node:assert/strict";
import { decodeCampaignCursor, encodeCampaignCursor } from "../../src/lib/campaign-pagination.mjs";

test("campaign pagination cursor round-trips timestamp and ObjectId", () => {
  const campaign = { _id: "66a000000000000000000001", createdAt: new Date("2026-11-07T05:00:00.000Z") };
  const decoded = decodeCampaignCursor(encodeCampaignCursor(campaign));
  assert.equal(decoded.id, campaign._id);
  assert.equal(decoded.createdAt.toISOString(), campaign.createdAt.toISOString());
});

test("campaign pagination cursor rejects malformed, oversized, and invalid values", () => {
  assert.equal(decodeCampaignCursor("not-a-cursor"), null);
  assert.equal(decodeCampaignCursor("a".repeat(513)), null);
  assert.equal(decodeCampaignCursor(Buffer.from(JSON.stringify({ id: "bad", createdAt: "2026-11-07" })).toString("base64url")), null);
  assert.equal(decodeCampaignCursor(Buffer.from(JSON.stringify({ id: "66a000000000000000000001", createdAt: "invalid" })).toString("base64url")), null);
});

test("campaign pagination cursor encoder rejects missing IDs or timestamps", () => {
  assert.throws(() => encodeCampaignCursor({ createdAt: new Date() }), /ID and valid createdAt/);
  assert.throws(() => encodeCampaignCursor({ _id: "66a000000000000000000001", createdAt: "invalid" }), /ID and valid createdAt/);
});
