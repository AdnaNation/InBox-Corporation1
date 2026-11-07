import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { initializeDatabase } from "@/lib/database";
import { isSameOrigin } from "@/lib/security";
import { consumeAuthRateLimits } from "@/lib/auth-rate-limit.mjs";
import { createPasswordResetToken } from "@/lib/password-reset.mjs";
import { sendPasswordResetEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    await initializeDatabase();
    const db = await getDatabase();
    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")?.trim()
      || "";
    const rateLimit = await consumeAuthRateLimits(db, [
      { scope: "password-reset-email", identity: email, limit: 3 },
      ...(forwardedIp ? [{ scope: "password-reset-ip", identity: forwardedIp, limit: 10 }] : []),
    ]);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: true, message: "If an active account uses that email address, a password reset link will be sent." },
        { status: 200 },
      );
    }

    const user = await db.collection("users").findOne(
      { email, status: "active" },
      { projection: { _id: 1, email: 1 } },
    );
    if (user) {
      const now = new Date();
      const reset = createPasswordResetToken(now);
      await db.collection("passwordResetTokens").deleteMany({
        userId: user._id,
        usedAt: { $exists: false },
      });
      await db.collection("passwordResetTokens").insertOne({
        userId: user._id,
        tokenHash: reset.tokenHash,
        expiresAt: reset.expiresAt,
        createdAt: now,
      });
      try {
        await sendPasswordResetEmail({
          to: user.email,
          token: reset.token,
          origin: process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
        });
      } catch (emailError) {
        console.error("Password reset email could not be sent:", emailError.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "If an active account uses that email address, a password reset link will be sent.",
    });
  } catch (error) {
    console.error("Password reset request error:", error.message);
    return NextResponse.json(
      { success: false, message: "Could not process your request. Please try again later." },
      { status: 503 },
    );
  }
}
