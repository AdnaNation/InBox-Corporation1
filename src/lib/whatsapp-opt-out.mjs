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
  "আনসাবস্ক্রাইব",
  "আনসাবস্ক্রাইব করুন",
  "অপ্ট আউট",
  "অপ্টআউট",
  "মেসেজ বন্ধ করুন",
  "বার্তা বন্ধ করুন",
  "যোগাযোগ বন্ধ করুন",
  "আর মেসেজ নয়",
  "আর মেসেজ না",
  "মেসেজ পাঠাবেন না",
  "মেসেজ দেবেন না",
  "মেসেজ দিবেন না",
  "মেসেজ দিয়েন না",
  "মেসেজ দিয়েন না",
  "মেসেজ করবেন না",
  "আর মেসেজ পাঠাবেন না",
  "আর মেসেজ দেবেন না",
  "আর মেসেজ দিবেন না",
  "আর মেসেজ দিয়েন না",
  "আর মেসেজ দিয়েন না",
  "আর মেসেজ করবেন না",
  "আর মেসেজ কইরেন না",
  "আমাকে আর মেসেজ দেবেন না",
  "আমাকে আর মেসেজ দিবেন না",
  "আমাকে আর মেসেজ দিয়েন না",
  "আমাকে আর মেসেজ দিয়েন না",
  "আমাকে আর মেসেজ করবেন না",
  "আমাকে আর মেসেজ কইরেন না",
  "যোগাযোগ করবেন না",
  "আমাকে আর যোগাযোগ করবেন না",
  "বার্তা পাঠাবেন না",
  "স্টপ",
  "bondho korun",
  "ar msg diben na",
  "ar message diben na",
  "msg diben na",
  "message diben na",
  "msg pathaben na",
  "message pathaben na",
  "ar msg pathaben na",
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

function normalizeOptOutText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?,;:।॥]+$/g, "");
}

function isOptOutText(value) {
  const text = normalizeOptOutText(value);
  return Boolean(text) && (
    EXACT_OPT_OUT_KEYWORDS.has(text) ||
    OPT_OUT_PHRASES.some((pattern) => pattern.test(text))
  );
}

export function isWhatsAppOptOutMessage(message) {
  if (!message || typeof message !== "object") return false;

  // Customers may reply with a normal text message or tap a WhatsApp
  // quick-reply/list button whose payload or visible title is STOP/Unsubscribe.
  const candidates = [];
  if (message.type === "text") {
    candidates.push(message.text?.body);
  } else if (message.type === "button") {
    candidates.push(message.button?.text, message.button?.payload);
  } else if (message.type === "interactive") {
    candidates.push(
      message.interactive?.button_reply?.title,
      message.interactive?.button_reply?.id,
      message.interactive?.list_reply?.title,
      message.interactive?.list_reply?.id,
      message.interactive?.list_reply?.description,
    );
  }

  return candidates.some(isOptOutText);
}
