import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDatabase } from "@/lib/db";
import clientPromise from "@/lib/mongodb";
import { destroySession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { hashPasswordResetToken } from "@/lib/password-reset.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(body.token);
  const password = body.password;
  if (!tokenHash) {
    return NextResponse.json({ success: false, message: "This password reset link is invalid or expired." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return NextResponse.json({ success: false, message: "Password must be at least 8 characters and no more than 72 bytes." }, { status: 400 });
  }

  let session;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await clientPromise;
    const db = await getDatabase();
    session = client.startSession();
    let updated = false;

    await session.withTransaction(async () => {
      const now = new Date();
      const claim = await db.collection("passwordResetTokens").findOneAndUpdate(
        { tokenHash, status: "pending", expiresAt: { $gt: now } },
        { $set: { status: "used", usedAt: now } },
        { session, returnDocument: "before", includeResultMetadata: false },
      );
      const tokenRecord = claim?.value ?? claim;
      if (!tokenRecord) return;

      const result = await db.collection("users").updateOne(
        { _id: tokenRecord.userId, status: "active" },
        { $set: { passwordHash, updatedAt: now }, $inc: { sessionVersion: 1 } },
        { session },
      );
      if (!result.matchedCount) throw new Error("Password reset account is no longer active.");

      await db.collection("passwordResetTokens").deleteMany(
        { userId: tokenRecord.userId, _id: { $ne: tokenRecord._id } },
        { session },
      );
      updated = true;
    });

    if (!updated) {
      return NextResponse.json({ success: false, message: "This password reset link is invalid, expired, or already used." }, { status: 400 });
    }

    await destroySession().catch((cookieError) => {
      console.error("Password reset session cookie cleanup failed:", cookieError.message);
    });
    return NextResponse.json({ success: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    console.error("Password reset completion error:", error.message);
    return NextResponse.json({ success: false, message: "Could not update your password. Please request a new reset link." }, { status: 503 });
  } finally {
    if (session) await session.endSession();
  }
}
