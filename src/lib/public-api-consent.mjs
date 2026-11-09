const OPT_OUT_SOURCES = new Set([
  "customer_request",
  "whatsapp_keyword",
  "external_system",
  "other",
]);

const OPT_IN_SOURCES = new Set([
  "website_form",
  "paper_form",
  "verbal",
  "whatsapp_initiated",
  "other",
]);

export function validatePublicApiConsentRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const action = typeof body.action === "string" ? body.action : "";
  const source = typeof body.source === "string" ? body.source : "";
  const evidence = typeof body.evidence === "string" ? body.evidence.trim() : "";

  if (action === "opt_out") {
    if (!OPT_OUT_SOURCES.has(source)) {
      return { error: "For opt-out, source must be customer_request, whatsapp_keyword, external_system, or other." };
    }
    if (body.evidence !== undefined && (typeof body.evidence !== "string" || evidence.length > 500)) {
      return { error: "Opt-out evidence must be a string no longer than 500 characters." };
    }
    return { action, source, evidence };
  }

  if (action === "opt_in") {
    if (!OPT_IN_SOURCES.has(source) || evidence.length < 8 || evidence.length > 500 || body.confirmed !== true) {
      return { error: "For opt-in, provide a valid source, 8–500 characters of fresh consent evidence, and confirmed: true." };
    }
    return { action, source, evidence };
  }

  return { error: "Action must be opt_out or opt_in." };
}
