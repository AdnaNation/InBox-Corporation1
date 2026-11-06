import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret } from "@/lib/crypto";
import { WEBHOOK_EVENT_TYPES, isValidWebhookTarget } from "@/lib/public-webhooks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canManage(session) {
  return ["owner", "admin"].includes(session?.membership?.role);
}
async function ensureIndexes(db) {
  await Promise.all([
    db.collection("webhookSubscriptions").createIndex({ workspaceId: 1, createdAt: -1 }),
    db.collection("webhookDeliveries").createIndex({ subscriptionId: 1, eventId: 1 }, { unique: true }),
    db.collection("webhookDeliveries").createIndex({ status: 1, nextAttemptAt: 1, leaseUntil: 1 }),
  ]);
}

export async function GET() {
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can manage webhooks." }, { status: 403 });
  const db = await getDatabase();
  await ensureIndexes(db);
  const subscriptions = await db.collection("webhookSubscriptions").find(
    { workspaceId: new ObjectId(session.workspace.id) },
    { projection: { url: 1, description: 1, events: 1, status: 1, createdAt: 1, updatedAt: 1, lastDeliveryAt: 1 } },
  ).sort({ createdAt: -1 }).limit(100).toArray();
  return NextResponse.json({ success: true, data: subscriptions.map((item) => ({
    id: item._id.toString(), url: item.url, description: item.description || "",
    events: item.events || [], status: item.status, createdAt: item.createdAt,
    updatedAt: item.updatedAt || null, lastDeliveryAt: item.lastDeliveryAt || null,
  })) });
}

export async function POST(request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can create webhooks." }, { status: 403 });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, message: "Request body must be a JSON object." }, { status: 400 });
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 120) : "";
  const events = Array.isArray(body.events) ? [...new Set(body.events)] : [];
  if (!isValidWebhookTarget(url)) return NextResponse.json({ success: false, message: "Webhook URL must be a valid HTTPS URL on the standard port, without credentials or a local/IP address." }, { status: 400 });
  if (!events.length || events.some((event) => !WEBHOOK_EVENT_TYPES.includes(event))) return NextResponse.json({ success: false, message: "Select at least one supported webhook event." }, { status: 400 });
  const db = await getDatabase();
  await ensureIndexes(db);
  const now = new Date();
  const secret = "whsec_" + randomBytes(32).toString("base64url");
  const result = await db.collection("webhookSubscriptions").insertOne({
    workspaceId: new ObjectId(session.workspace.id), createdByUserId: new ObjectId(session.user.id),
    url, description, events, secretEncrypted: encryptSecret(secret), status: "active",
    createdAt: now, updatedAt: now,
  });
  return NextResponse.json({
    success: true,
    data: { id: result.insertedId.toString(), url, description, events, status: "active", createdAt: now },
    secret, message: "Save this signing secret now. It will only be shown once.",
  }, { status: 201 });
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can disable webhooks." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "Invalid webhook subscription ID." }, { status: 400 });
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const subscriptionId = new ObjectId(id);
  const result = await db.collection("webhookSubscriptions").updateOne(
    { _id: subscriptionId, workspaceId, status: "active" },
    { $set: { status: "disabled", disabledAt: new Date(), updatedAt: new Date() }, $unset: { secretEncrypted: "" } },
  );
  if (!result.matchedCount) return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  await db.collection("webhookDeliveries").updateMany(
    { subscriptionId, workspaceId, status: { $in: ["pending", "retry"] } },
    { $set: { status: "cancelled", updatedAt: new Date() } },
  );
  return NextResponse.json({ success: true, message: "Webhook subscription disabled." });
}
