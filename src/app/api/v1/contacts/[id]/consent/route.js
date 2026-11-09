import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { validatePublicApiConsentRequest } from "@/lib/public-api-consent.mjs";
import { applyPublicApiConsent } from "@/lib/public-api-consent-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "contacts:write");
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      {
        status: auth.status,
        headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
      },
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) {
    return NextResponse.json({ success: false, message: "A valid contact ID is required." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }

  const consent = validatePublicApiConsentRequest(body);
  if (consent.error) {
    return NextResponse.json({ success: false, message: consent.error }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const workspaceId = new ObjectId(auth.apiKey.workspaceId);
    const result = await applyPublicApiConsent(db, {
      workspaceId,
      contactId: new ObjectId(id),
      apiKey: auth.apiKey,
      consent,
    });

    if (!result) {
      return NextResponse.json({ success: false, message: "Contact not found in this workspace." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: consent.action === "opt_out"
        ? "Opt-out recorded. This phone number is suppressed from future WhatsApp sends."
        : "Fresh consent recorded and the suppression has been cleared. The contact may receive eligible WhatsApp messages again.",
    });
  } catch (error) {
    console.error("Public API contact consent update failed:", error);
    return NextResponse.json(
      { success: false, message: "Could not complete the consent update. Check the contact's current consent and suppression state before retrying." },
      { status: 503 },
    );
  }
}
