import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await authenticateApiKey(request, "webhooks:write");
  if (auth.error) {
    return NextResponse.json({ success: false, message: auth.error }, {
      status: auth.status,
      headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
    });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) {
    return NextResponse.json({ success: false, message: "A valid webhook subscription ID is required." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const subscriptionId = new ObjectId(id);
  const secret = "whsec_" + randomBytes(32).toString("base64url");
  const now = new Date();
  const result = await db.collection("webhookSubscriptions").updateOne(
    { _id: subscriptionId, workspaceId, status: "active" },
    { $set: { secretEncrypted: encryptSecret(secret), secretRotatedAt: now, updatedAt: now } },
  );

  if (!result.matchedCount) {
    return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: { id, secretRotatedAt: now },
    secret,
    message: "Webhook signing secret rotated. Save the new secret now; it is shown only once. The previous secret is no longer valid.",
  });
}