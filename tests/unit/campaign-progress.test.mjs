import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCampaignRecipientStatuses } from "../../src/lib/campaign-progress.mjs";

test("keeps a campaign sending while recipients are pending or processing", () => {
  const result = summarizeCampaignRecipientStatuses([
    { _id: "accepted", count: 4 },
    { _id: "pending", count: 2 },
    { _id: "processing", count: 1 },
  ], 7);

  assert.equal(result.total, 7);
  assert.equal(result.finished, false);
  assert.equal(result.status, "sending");
});

test("marks all-success campaigns completed after delivery callbacks", () => {
  const result = summarizeCampaignRecipientStatuses([
    { _id: "sent", count: 2 },
    { _id: "delivered", count: 3 },
    { _id: "read", count: 1 },
  ], 6);

  assert.equal(result.finished, true);
  assert.equal(result.status, "completed");
  assert.equal(result.total, 6);
});

test("promotes a previously completed campaign to completed_with_issues when Meta reports failure", () => {
  const result = summarizeCampaignRecipientStatuses([
    { _id: "delivered", count: 4 },
    { _id: "failed", count: 1 },
  ], 5);

  assert.equal(result.finished, true);
  assert.equal(result.status, "completed_with_issues");
  assert.equal(result.counts.failed, 1);
});

test("removes a delivery issue when a later higher-ranked callback corrects its status", () => {
  const result = summarizeCampaignRecipientStatuses([
    { _id: "delivered", count: 4 },
    { _id: "read", count: 1 },
  ], 5);

  assert.equal(result.status, "completed");
  assert.equal(result.counts.failed, 0);
});

test("counts unknown and skipped recipients as issues and ignores unknown status labels", () => {
  const result = summarizeCampaignRecipientStatuses([
    { _id: "unknown", count: 1 },
    { _id: "skipped", count: 2 },
    { _id: "legacy-unmapped", count: 10 },
  ], 3);

  assert.equal(result.status, "completed_with_issues");
  assert.equal(result.total, 3);
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.counts.skipped, 2);
});
