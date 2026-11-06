import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
  const requestedLimit = Number(searchParams.get("limit") || 20);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 20, 1), 100);
  const deliveries = await db.collection("webhookDeliveries").find(
    { subscriptionId, workspaceId },
    { projection: { eventId: 1, event: 1, status: 1, attempts: 1, responseStatus: 1, lastError: 1, createdAt: 1, deliveredAt: 1, nextAttemptAt: 1 } },
  ).sort({ createdAt: -1 }).limit(limit).toArray();
  return NextResponse.json({ success: true, data: deliveries.map((item) => ({
    id: item._id.toString(), eventId: item.eventId, type: item.event?.type || "unknown",
    status: item.status, attempts: item.attempts || 0, responseStatus: item.responseStatus || null,
    lastError: item.lastError || null, createdAt: item.createdAt,
    deliveredAt: item.deliveredAt || null, nextAttemptAt: item.nextAttemptAt || null,
  })) });
}
