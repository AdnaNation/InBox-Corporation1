import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { WEBHOOK_EVENT_CATALOG } from "@/lib/public-webhooks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authenticateApiKey(request, "webhooks:read");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });

  return NextResponse.json({
    success: true,
    data: WEBHOOK_EVENT_CATALOG,
    pagination: { returned: WEBHOOK_EVENT_CATALOG.length },
  });
}
