import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PLAN_PRICING, getPublicPlanPricing, normalizePlanPricing } from "../../src/lib/plan-pricing.mjs";

test("normalizes configured plan prices as integer minor units", () => {
  const result = normalizePlanPricing({
    currency: "bdt",
    plans: {
      starter: { monthlyMinor: 120000, yearlyMinor: 1200000 },
      growth: { monthlyMinor: 250000, yearlyMinor: 2500000 },
      business: { monthlyMinor: null, yearlyMinor: 5000000 },
    },
  });
  assert.equal(result.currency, "BDT");
  assert.equal(result.plans.starter.monthlyMinor, 120000);
  assert.equal(result.plans.business.monthlyMinor, null);
});

test("rejects unsupported currencies, negative prices, floats and unsafe amounts", () => {
  const base = {
    currency: "BDT",
    plans: {
      starter: { monthlyMinor: 100, yearlyMinor: null },
      growth: { monthlyMinor: null, yearlyMinor: null },
      business: { monthlyMinor: null, yearlyMinor: null },
    },
  };
  assert.throws(() => normalizePlanPricing({ ...base, currency: "EUR" }), /BDT or USD/);
  assert.throws(() => normalizePlanPricing({ ...base, plans: { ...base.plans, starter: { monthlyMinor: -1, yearlyMinor: null } } }), /valid monthly price/);
  assert.throws(() => normalizePlanPricing({ ...base, plans: { ...base.plans, starter: { monthlyMinor: 1.5, yearlyMinor: null } } }), /valid monthly price/);
  assert.throws(() => normalizePlanPricing({ ...base, plans: { ...base.plans, starter: { monthlyMinor: Number.MAX_SAFE_INTEGER + 1, yearlyMinor: null } } }), /valid monthly price/);
});

test("requires at least one published price and all plan records", () => {
  assert.throws(() => normalizePlanPricing(DEFAULT_PLAN_PRICING), /at least one/);
  assert.throws(() => normalizePlanPricing({ currency: "BDT", plans: { starter: { monthlyMinor: 100 } } }), /Missing pricing/);
});

test("public pricing serialization safely defaults missing or malformed values", () => {
  assert.deepEqual(getPublicPlanPricing(null), DEFAULT_PLAN_PRICING);
  assert.deepEqual(getPublicPlanPricing({
    currency: "invalid",
    plans: { starter: { monthlyMinor: -1, yearlyMinor: 1200 } },
  }), {
    currency: "BDT",
    plans: {
      starter: { monthlyMinor: null, yearlyMinor: 1200 },
      growth: { monthlyMinor: null, yearlyMinor: null },
      business: { monthlyMinor: null, yearlyMinor: null },
    },
  });
});
