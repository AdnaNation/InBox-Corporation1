import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

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
  const subscription = await db.collection("webhookSubscriptions").findOne({ _id: subscriptionId, workspaceId, status: "active", secretEncrypted: { $exists: true, $ne: "" } }, { projection: { _id: 1 } });
  if (!subscription) return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  const now = new Date();
  const eventId = "evt_test_" + randomUUID();
  const event = { id: eventId, type: "webhook.test", createdAt: now.toISOString(), data: { message: "Wavo test delivery. Your endpoint received a signed test event.", test: true } };
  const result = await db.collection("webhookDeliveries").insertOne({ subscriptionId, workspaceId, eventId, event, status: "pending", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now });
  return NextResponse.json({ success: true, data: { deliveryId: result.insertedId.toString(), eventId, status: "pending" }, message: "Test webhook queued. Check delivery history for its result." }, { status: 202 });
}