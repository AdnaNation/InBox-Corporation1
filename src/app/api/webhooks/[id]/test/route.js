import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can send test webhooks." }, { status: 403 });
  const { id } = await params;
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "Invalid webhook subscription ID." }, { status: 400 });
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const subscriptionId = new ObjectId(id);
  const subscription = await db.collection("webhookSubscriptions").findOne({ _id: subscriptionId, workspaceId, status: "active", secretEncrypted: { $exists: true, $ne: "" } }, { projection: { _id: 1 } });
  if (!subscription) return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  const now = new Date();
  const eventId = "evt_test_" + randomUUID();
  const event = { id: eventId, type: "webhook.test", createdAt: now.toISOString(), data: { message: "Wavo test delivery. Your endpoint received a signed test event.", test: true } };
  const result = await db.collection("webhookDeliveries").insertOne({ subscriptionId, workspaceId, eventId, event, status: "pending", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now });
  return NextResponse.json({ success: true, data: { deliveryId: result.insertedId.toString(), eventId, status: "pending" }, message: "Test webhook queued. Check delivery history for its result." }, { status: 202 });
}