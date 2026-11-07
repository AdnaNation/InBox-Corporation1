import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { queueWebhookTestDelivery } from "@/lib/webhook-test-delivery.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "webhooks:write");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status, headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined });
  const { id } = await params;
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "Invalid webhook subscription ID." }, { status: 400 });
  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const subscriptionId = new ObjectId(id);
  const data = await queueWebhookTestDelivery(db, { workspaceId, subscriptionId });
  if (!data) return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  return NextResponse.json({ success: true, data, message: "Test webhook queued. Check delivery history for its result." }, { status: 202 });
}
