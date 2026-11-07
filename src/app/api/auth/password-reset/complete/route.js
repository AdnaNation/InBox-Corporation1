import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDatabase } from "@/lib/db";
import clientPromise from "@/lib/mongodb";
import { isSameOrigin } from "@/lib/security";
import { initializeDatabase } from "@/lib/database";
import { consumeAuthRateLimits } from "@/lib/auth-rate-limit.mjs";
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
    await initializeDatabase();
    const db = await getDatabase();
    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")?.trim()
      || "";
    const rateLimit = await consumeAuthRateLimits(db, [
      { scope: "password-reset-complete-token", identity: tokenHash, limit: 5 },
      ...(forwardedIp ? [{ scope: "password-reset-complete-ip", identity: forwardedIp, limit: 10 }] : []),
    ]);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many password reset attempts. Request a new link or try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const availableToken = await db.collection("passwordResetTokens").findOne(
      { tokenHash, status: "pending", expiresAt: { $gt: new Date() } },
      { projection: { _id: 1 } },
    );
    if (!availableToken) {
      return NextResponse.json({ success: false, message: "This password reset link is invalid, expired, or already used." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const client = await clientPromise;
    session = client.startSession();
    let updated = false;

    await session.withTransaction(async () => {
      // The driver may retry this callback after a transient transaction error.
      updated = false;
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

    return NextResponse.json({ success: true, message: "Password updated. Sign in with your new password." });
  } catch (error) {
    console.error("Password reset completion error:", error.message);
    return NextResponse.json({ success: false, message: "Could not update your password. Please request a new reset link." }, { status: 503 });
  } finally {
    if (session) await session.endSession();
  }
}
