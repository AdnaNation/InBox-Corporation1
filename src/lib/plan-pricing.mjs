export const BILLABLE_PLANS = ["starter", "growth", "business"];

export const DEFAULT_PLAN_PRICING = {
  currency: "BDT",
  plans: Object.fromEntries(BILLABLE_PLANS.map((plan) => [plan, { monthlyMinor: null, yearlyMinor: null }])),
};

export function normalizePlanPricing(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Pricing configuration must be an object.");
  }

  const currency = String(input.currency || "").trim().toUpperCase();
  if (!["BDT", "USD"].includes(currency)) {
    throw new Error("Choose BDT or USD as the pricing currency.");
  }

  if (!input.plans || typeof input.plans !== "object" || Array.isArray(input.plans)) {
    throw new Error("Provide pricing for each paid plan.");
  }

  const plans = {};
  let configuredPrices = 0;
  for (const plan of BILLABLE_PLANS) {
    const source = input.plans[plan];
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error("Missing pricing for the " + plan + " plan.");
    }

    plans[plan] = {};
    for (const cycle of ["monthly", "yearly"]) {
      const key = cycle + "Minor";
      const value = source[key];
      if (value === null || value === undefined || value === "") {
        plans[plan][key] = null;
        continue;
      }
      if (!Number.isSafeInteger(value) || value < 0 || value > 100000000000) {
        throw new Error("Enter a valid " + cycle + " price for the " + plan + " plan.");
      }
      plans[plan][key] = value;
      configuredPrices++;
    }
  }

  if (!configuredPrices) {
    throw new Error("Set at least one monthly or yearly price before saving.");
  }

  return { currency, plans };
}

export function getPublicPlanPricing(document) {
  if (!document || typeof document !== "object") return DEFAULT_PLAN_PRICING;
  const pricing = { currency: ["BDT", "USD"].includes(document.currency) ? document.currency : "BDT", plans: {} };
  for (const plan of BILLABLE_PLANS) {
    const source = document.plans?.[plan] || {};
    pricing.plans[plan] = {};
    for (const cycle of ["monthly", "yearly"]) {
      const value = source[cycle + "Minor"];
      pricing.plans[plan][cycle + "Minor"] = Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
  }
  return pricing;
}
