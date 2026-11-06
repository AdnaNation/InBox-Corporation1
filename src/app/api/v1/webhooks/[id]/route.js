import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const auth = await authenticateApiKey(request, "webhooks:write");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, {
    status: auth.status,
    headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
  });
  const { id } = await params;
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "A valid webhook subscription ID is required." }, { status: 400 });
  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
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
