import assert from "node:assert/strict";
import test from "node:test";
import { getEffectiveWorkspacePlan } from "../../src/lib/plan-limits.js";

test("keeps paid plan access for active subscriptions", () => {
  assert.equal(getEffectiveWorkspacePlan({ plan: "growth", status: "active" }), "growth");
});

test("keeps legacy paid plans active when subscription status is absent", () => {
  assert.equal(getEffectiveWorkspacePlan({ plan: "starter" }), "starter");
});

test("grants a bounded grace period for past-due subscriptions", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  assert.equal(getEffectiveWorkspacePlan({ plan: "business", status: "past_due", graceUntil: "2026-11-10T12:00:00.000Z" }, now), "business");
  assert.equal(getEffectiveWorkspacePlan({ plan: "business", status: "past_due", graceUntil: "2026-11-07T12:00:00.000Z" }, now), "free");
  assert.equal(getEffectiveWorkspacePlan({ plan: "business", status: "past_due" }, now), "free");
});

test("downgrades paused and canceled subscriptions to the free entitlement", () => {
  assert.equal(getEffectiveWorkspacePlan({ plan: "growth", status: "paused" }), "free");
  assert.equal(getEffectiveWorkspacePlan({ plan: "growth", status: "canceled" }), "free");
  assert.equal(getEffectiveWorkspacePlan({ plan: "unknown", status: "active" }), "free");
});
