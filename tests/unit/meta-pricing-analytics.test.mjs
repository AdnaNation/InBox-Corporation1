import assert from "node:assert/strict";
import test from "node:test";
import { aggregateMetaPricingPoints, getMetaPricingDataPoints } from "../../src/lib/meta-pricing-analytics.mjs";

test("returns an explicit zero for an empty successful Meta analytics response", () => {
  const result = aggregateMetaPricingPoints([], new Date("2026-11-08T12:00:00.000Z"));
  assert.equal(result.costAvailable, true);
  assert.deepEqual(result.currentMonth, { month: "2026-11", cost: 0, volume: 0 });
  assert.deepEqual(result.total, { cost: 0, volume: 0 });
});

test("aggregates Meta cost and volume by category, phone, and month", () => {
  const result = aggregateMetaPricingPoints([
    { start: 1790899200, phone_number: "8801700000000", pricing_category: "MARKETING", cost: 0.0732, volume: 1 },
    { start: 1790899200, phone_number: "8801700000000", pricing_category: "UTILITY", cost: "0.0037", volume: 2 },
    { start: 1793577600, phone_number: "8801800000000", pricing_category: "MARKETING", cost: 0.1464, volume: 2 },
  ], new Date("2026-11-08T12:00:00.000Z"));

  assert.equal(result.costAvailable, true);
  assert.equal(result.total.cost, 0.2233);
  assert.equal(result.total.volume, 5);
  assert.deepEqual(result.currentMonth, { month: "2026-11", cost: 0.1464, volume: 2 });
  assert.equal(result.byCategory.find((row) => row.category === "marketing").volume, 3);
  assert.equal(result.byPhone.length, 2);
  assert.equal(result.monthly.length, 2);
});

test("does not invent a cost when Meta returns volume without cost", () => {
  const result = aggregateMetaPricingPoints([
    { start: 1793577600, pricing_category: "MARKETING", volume: 4 },
  ], new Date("2026-11-08T12:00:00.000Z"));
  assert.equal(result.costAvailable, false);
  assert.equal(result.currentMonth.cost, 0);
  assert.equal(result.currentMonth.volume, 4);
});

test("supports Meta's alternate nested analytics data response shape", () => {
  const points = [{ volume: 1, cost: 0.01 }];
  assert.deepEqual(getMetaPricingDataPoints({ data: [{ data_points: points }] }), points);
  assert.deepEqual(getMetaPricingDataPoints({ data_points: points }), points);
  assert.deepEqual(getMetaPricingDataPoints({}), []);
});
