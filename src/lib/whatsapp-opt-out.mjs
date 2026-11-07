const EXACT_OPT_OUT_KEYWORDS = new Set([
  "stop",
  "stop all",
  "unsubscribe",
  "unsubscribe me",
  "cancel",
  "end",
  "quit",
  "remove",
  "remove me",
  "opt out",
  "optout",
  "opt-out",
]);

const OPT_OUT_PHRASES = [
  /^(?:please\s+)?stop(?:\s+(?:sending|messaging|contacting|texting)(?:\s+me)?(?:\s+(?:anymore|messages?|on whatsapp))?)?(?:\s+please)?$/,
  /^(?:please\s+)?(?:don't|do not|dont)\s+(?:send|message|text|contact)\s+me(?:\s+(?:again|anymore))?(?:\s+(?:messages?|on whatsapp))?(?:\s+please)?$/,
  /^(?:i\s+)?(?:don't|do not|dont)\s+want\s+(?:to\s+)?(?:receive|get)\s+(?:any\s+)?(?:more\s+)?messages?(?:\s+from\s+you)?(?:\s+please)?$/,
  /^(?:i\s+)?want\s+to\s+stop\s+(?:receiving|get|receive)\s+(?:any\s+)?(?:more\s+)?messages?(?:\s+please)?$/,
  /^(?:please\s+)?unsubscribe(?:\s+me)?(?:\s+from\s+(?:all\s+)?messages?)?(?:\s+please)?$/,
  /^(?:please\s+)?remove\s+me(?:\s+from\s+(?:all\s+)?messages?)?(?:\s+please)?$/,
  /^(?:please\s+)?opt[- ]?out(?:\s+of\s+(?:all\s+)?messages?)?(?:\s+please)?$/,
  /^(?:no\s+more\s+messages?|stop\s+all\s+(?:messages?|communications?))$/,
  /^(?:please\s+)?cancel(?:\s+my)?\s+(?:subscription|messages?)(?:\s+please)?$/,
];

export function isWhatsAppOptOutMessage(message) {
  if (message?.type !== "text") return false;

  const text = String(message.text?.body || "")
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:]+$/g, "");

  if (!text) return false;
  return EXACT_OPT_OUT_KEYWORDS.has(text) || OPT_OUT_PHRASES.some((pattern) => pattern.test(text));
}
