import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { retryFailedWebhookDelivery } from "@/lib/webhook-retry.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  const session = await getSession();
  if (!session?.workspace?.id) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can retry webhook deliveries." }, { status: 403 });
  }

  const { id, deliveryId } = await params;
  if (!ObjectId.isValid(id || "") || !ObjectId.isValid(deliveryId || "")) {
    return NextResponse.json({ success: false, message: "Invalid webhook or delivery ID." }, { status: 400 });
  }

  const db = await getDatabase();
  const result = await retryFailedWebhookDelivery(db, {
    workspaceId: new ObjectId(session.workspace.id),
    subscriptionId: new ObjectId(id),
    deliveryId: new ObjectId(deliveryId),
  });

  if (!result.retried) {
    const notFound = result.reason === "subscription_not_found";
    return NextResponse.json({
      success: false,
      message: notFound ? "Active webhook subscription not found." : "Only failed deliveries can be retried.",
    }, { status: notFound ? 404 : 409 });
  }

  return NextResponse.json({ success: true, message: "Webhook delivery queued for another attempt." });
}
