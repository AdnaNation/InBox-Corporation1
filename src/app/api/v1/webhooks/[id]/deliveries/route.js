import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await authenticateApiKey(request, "webhooks:read");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });
  const { id } = await params;
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "A valid webhook subscription ID is required." }, { status: 400 });
  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const subscriptionId = new ObjectId(id);
  const subscription = await db.collection("webhookSubscriptions").findOne(
    { _id: subscriptionId, workspaceId },
    { projection: { _id: 1 } },
  );
  if (!subscription) return NextResponse.json({ success: false, message: "Webhook subscription not found." }, { status: 404 });
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") || 50);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);
  const deliveries = await db.collection("webhookDeliveries").find(
    { subscriptionId, workspaceId },
    { projection: { eventId: 1, event: 1, status: 1, attempts: 1, responseStatus: 1, lastError: 1, createdAt: 1, deliveredAt: 1, nextAttemptAt: 1 } },
  ).sort({ createdAt: -1 }).limit(limit).toArray();
  return NextResponse.json({ success: true, data: deliveries.map((item) => ({
    id: item._id.toString(), eventId: item.eventId, type: item.event?.type || "unknown",
    status: item.status, attempts: item.attempts || 0, responseStatus: item.responseStatus || null,
    lastError: item.lastError || null, createdAt: item.createdAt,
    deliveredAt: item.deliveredAt || null, nextAttemptAt: item.nextAttemptAt || null,
  })), pagination: { limit, returned: deliveries.length } });
}
