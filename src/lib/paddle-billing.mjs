import { createHmac, timingSafeEqual } from "node:crypto";

export const PADDLE_PLANS = ["starter", "growth", "business"];
export const PADDLE_CYCLES = ["monthly", "yearly"];

const PRICE_ENV_KEYS = {
  starter: { monthly: "PADDLE_PRICE_STARTER_MONTHLY", yearly: "PADDLE_PRICE_STARTER_YEARLY" },
  growth: { monthly: "PADDLE_PRICE_GROWTH_MONTHLY", yearly: "PADDLE_PRICE_GROWTH_YEARLY" },
  business: { monthly: "PADDLE_PRICE_BUSINESS_MONTHLY", yearly: "PADDLE_PRICE_BUSINESS_YEARLY" },
};

const PRICE_ID_PATTERN = /^pri_[a-z0-9]{26}$/i;

export function getPaddlePriceIds(env = process.env) {
  const priceIds = {};
  for (const plan of PADDLE_PLANS) {
    priceIds[plan] = {};
    for (const cycle of PADDLE_CYCLES) {
      const key = PRICE_ENV_KEYS[plan][cycle];
      const value = String(env[key] || "").trim();
      priceIds[plan][cycle] = PRICE_ID_PATTERN.test(value) ? value : null;
    }
  }
  return priceIds;
}

export function getPaddleCheckoutConfiguration(env = process.env) {
  const priceIds = getPaddlePriceIds(env);
  const allPricesConfigured = PADDLE_PLANS.every((plan) =>
    PADDLE_CYCLES.every((cycle) => Boolean(priceIds[plan][cycle])),
  );
  const clientToken = String(env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "").trim();
  const webhookSecret = String(env.PADDLE_WEBHOOK_SECRET || "").trim();
  const environment = env.PADDLE_ENVIRONMENT === "sandbox" ? "sandbox" : "production";

  return {
    enabled: Boolean(clientToken && webhookSecret && allPricesConfigured),\n    portalEnabled: Boolean(String(env.PADDLE_API_KEY || "").trim()),
    clientToken: clientToken || null,
    environment,
    priceIds,
  };
}

export function resolvePaddlePrice(priceId, env = process.env) {
  if (!priceId) return null;
  const priceIds = getPaddlePriceIds(env);
  for (const plan of PADDLE_PLANS) {
    for (const billingCycle of PADDLE_CYCLES) {
      if (priceIds[plan][billingCycle] === priceId) return { plan, billingCycle };
    }
  }
  return null;
}

export function getPaddleItemPriceId(item) {
  return item?.price?.id || item?.price_id || item?.priceId || null;
}

export function getPaddleSignatureParts(header) {
  if (typeof header !== "string" || !header.trim()) return null;
  const parts = {};
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (key === "ts") parts.ts = value;
    if (key === "h1") {
      parts.h1 ||= [];
      parts.h1.push(value);
    }
  }
  if (!parts.ts || !/^\d+$/.test(parts.ts) || !parts.h1?.length) return null;
  return parts;
}

export function verifyPaddleSignature(rawBody, signatureHeader, secret, nowMs = Date.now(), toleranceSeconds = 300) {
  if (typeof rawBody !== "string" || !secret) return false;
  const parts = getPaddleSignatureParts(signatureHeader);
  if (!parts) return false;

  const timestamp = Number(parts.ts);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(nowMs / 1000) - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(parts.ts + ":" + rawBody).digest();
  return parts.h1.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function getPaddleEventId(event) {
  const value = event?.event_id || event?.notification_id || event?.id;
  return typeof value === "string" && value.length <= 128 ? value : null;
}

export function getPaddleEventType(event) {
  const value = event?.event_type || event?.type;
  return typeof value === "string" ? value : "";
}
