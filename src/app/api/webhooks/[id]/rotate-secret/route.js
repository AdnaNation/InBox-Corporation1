import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) {
    return NextResponse.json({ success: false, message: "Only workspace owners and admins can rotate webhook secrets." }, { status: 403 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "Invalid webhook subscription ID." }, { status: 400 });

  const secret = "whsec_" + randomBytes(32).toString("base64url");
  const now = new Date();
  const db = await getDatabase();
  const result = await db.collection("webhookSubscriptions").updateOne(
    { _id: new ObjectId(id), workspaceId: new ObjectId(session.workspace.id), status: "active" },
    { $set: { secretEncrypted: encryptSecret(secret), secretRotatedAt: now, updatedAt: now } },
  );
  if (!result.matchedCount) return NextResponse.json({ success: false, message: "Active webhook subscription not found." }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: { id, secretRotatedAt: now },
    secret,
    message: "Webhook signing secret rotated. Save the new secret now; it is shown only once. The previous secret is no longer valid.",
  });
}