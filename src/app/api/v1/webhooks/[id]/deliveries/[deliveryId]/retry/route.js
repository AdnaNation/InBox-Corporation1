import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authError(auth) {
  return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });
}

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "webhooks:write");
  if (auth.error) return authError(auth);

  const { id, deliveryId } = await params;
  if (!ObjectId.isValid(id || "") || !ObjectId.isValid(deliveryId || "")) {
    return NextResponse.json({ success: false, message: "Valid webhook subscription and delivery IDs are required." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const subscriptionId = new ObjectId(id);
  const deliveryObjectId = new ObjectId(deliveryId);
  const subscription = await db.collection("webhookSubscriptions").findOne(
    { _id: subscriptionId, workspaceId, status: "active", secretEncrypted: { $exists: true, $ne: "" } },
    { projection: { _id: 1 } },
  );
  if (!subscription) {
    return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  }

  const now = new Date();
  const result = await db.collection("webhookDeliveries").findOneAndUpdate(
    { _id: deliveryObjectId, subscriptionId, workspaceId, status: "failed" },
    {
      $set: { status: "pending", attempts: 0, nextAttemptAt: now, manualRetryAt: now, updatedAt: now },
      $inc: { manualRetries: 1 },
      $unset: { failedAt: "", lastError: "", responseStatus: "", deliveredAt: "", leaseOwner: "", leaseUntil: "" },
    },
    { returnDocument: "after" },
  );
  const delivery = result?.value ?? result;
  if (!delivery?._id) {
    return NextResponse.json({
      success: false,
      code: "DELIVERY_NOT_RETRYABLE",
      message: "Delivery was not found for this subscription, or it is not in the failed state.",
    }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    data: { id: delivery._id.toString(), eventId: delivery.eventId, status: delivery.status, manualRetries: delivery.manualRetries || 0, nextAttemptAt: delivery.nextAttemptAt },
    message: "Webhook delivery queued for another attempt.",
  }, { status: 202 });
}