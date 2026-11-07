import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { queueWebhookTestDelivery } from "@/lib/webhook-test-delivery.mjs";

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
  const data = await queueWebhookTestDelivery(db, { workspaceId, subscriptionId });
  if (!data) return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  return NextResponse.json({ success: true, data, message: "Test webhook queued. Check delivery history for its result." }, { status: 202 });
}
