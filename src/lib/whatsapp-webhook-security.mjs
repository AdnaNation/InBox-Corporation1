import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsAppWebhookSignature(rawBody, signature, appSecret) {
  if (!rawBody || !signature || !appSecret) return false;
  const received = signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(received, "hex");
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}
