export function normalizePhoneNumber(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const raw = String(value).trim();

  if (!raw) return null;

  // Accept Bengali, Arabic-Indic, and Eastern Arabic-Indic digits commonly
  // used in customer-entered phone numbers, then validate as ASCII E.164.
  const asciiDigits = raw.replace(/[০-৯٠-٩۰-۹]/g, (digit) => {
    const code = digit.codePointAt(0);
    if (code >= 0x09E6 && code <= 0x09EF) return String(code - 0x09E6);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06F0 && code <= 0x06F9) return String(code - 0x06F0);
    return digit;
  });

  // Keep digits and an optional leading plus sign.
  const cleaned = asciiDigits.replace(/[^\d+]/g, "");
  const normalized = cleaned.startsWith("+")
    ? `+${cleaned.slice(1).replace(/\+/g, "")}`
    : cleaned.replace(/\+/g, "");

  // WhatsApp Cloud API phone numbers use international format.
  // E.164: 8–15 digits, first digit cannot be zero.
  const digits = normalized.replace(/^\+/, "");

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    return null;
  }

  return digits;
}

export function normalizePhoneNumbers(value) {
  const values = Array.isArray(value) ? value : [value];

  const valid = [];
  const invalid = [];

  for (const item of values) {
    const phone = normalizePhoneNumber(item);

    if (phone) {
      if (!valid.includes(phone)) valid.push(phone);
    } else {
      invalid.push(item);
    }
  }

  return { valid, invalid };
}
