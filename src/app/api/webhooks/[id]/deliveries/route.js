import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildWebhookDeliveryHistoryFilter, decodeWebhookDeliveryCursor, encodeWebhookDeliveryCursor, ensureWebhookDeliveryHistoryIndex } from "@/lib/webhook-delivery-pagination.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership.role)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can view webhook deliveries." }, { status: 403 });
  const { id } = await params;
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "Invalid webhook subscription ID." }, { status: 400 });
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const subscriptionId = new ObjectId(id);
  const subscription = await db.collection("webhookSubscriptions").findOne({ _id: subscriptionId, workspaceId }, { projection: { _id: 1 } });
  if (!subscription) return NextResponse.json({ success: false, message: "Webhook subscription not found." }, { status: 404 });
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const requestedLimit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return NextResponse.json({ success: false, message: "The limit must be an integer between 1 and 100." }, { status: 400 });
  }
  const cursorValue = searchParams.get("before");
  const cursor = cursorValue ? decodeWebhookDeliveryCursor(cursorValue) : null;
  if (cursorValue && !cursor) {
    return NextResponse.json({ success: false, message: "The before cursor is invalid." }, { status: 400 });
  }
  try {
    await ensureWebhookDeliveryHistoryIndex(db);
  } catch (error) {
    console.error("Dashboard webhook delivery history index unavailable:", error);
    return NextResponse.json({ success: false, message: "Webhook delivery history is temporarily unavailable." }, { status: 503 });
  }
  const deliveries = await db.collection("webhookDeliveries").find(
    buildWebhookDeliveryHistoryFilter(subscriptionId, workspaceId, cursor),
    { projection: { eventId: 1, event: 1, status: 1, attempts: 1, responseStatus: 1, lastError: 1, createdAt: 1, deliveredAt: 1, nextAttemptAt: 1, manualRetries: 1 } },
  ).sort({ createdAt: -1, _id: -1 }).limit(requestedLimit + 1).toArray();
  const hasMore = deliveries.length > requestedLimit;
  const page = deliveries.slice(0, requestedLimit);
  const last = page[page.length - 1];
  return NextResponse.json({
    success: true,
    data: page.map((item) => ({
      id: item._id.toString(), eventId: item.eventId, type: item.event?.type || "unknown",
      status: item.status, attempts: item.attempts || 0, manualRetries: item.manualRetries || 0, responseStatus: item.responseStatus || null,
      lastError: item.lastError || null, createdAt: item.createdAt,
      deliveredAt: item.deliveredAt || null, nextAttemptAt: item.nextAttemptAt || null,
    })),
    pagination: {
      limit: requestedLimit,
      returned: page.length,
      hasMore,
      nextCursor: hasMore && last?.createdAt ? encodeWebhookDeliveryCursor(last) : null,
    },
  });
}
