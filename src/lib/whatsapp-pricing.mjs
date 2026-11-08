export const BANGLADESH_WHATSAPP_RATES_USD = Object.freeze({
  MARKETING: 0.0732,
  UTILITY: 0.0037,
  AUTHENTICATION: 0.0037,
  SERVICE: 0.0037,
});

export const BANGLADESH_WHATSAPP_RATE_EFFECTIVE_DATE = "2026-10-01";
export const ILLUSTRATIVE_USD_TO_BDT = 124;

export function getBangladeshWhatsAppRate(category) {
  const normalized = String(category || "").trim().toUpperCase();
  return BANGLADESH_WHATSAPP_RATES_USD[normalized] ?? null;
}

export function estimateBangladeshWhatsAppCost(category, deliveredMessages) {
  const rate = getBangladeshWhatsAppRate(category);
  const count = Number(deliveredMessages);
  if (rate === null || !Number.isSafeInteger(count) || count < 0) return null;
  return Number((rate * count).toFixed(4));
}
