import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { initializeDatabase } from "@/lib/database";
import { isSameOrigin } from "@/lib/security";
import { consumeAuthRateLimits } from "@/lib/auth-rate-limit.mjs";
import { createEmailVerificationToken } from "@/lib/email-verification.mjs";
import { sendVerificationEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Please sign in to verify your email." }, { status: 401 });
    }
    if (session.user.emailVerified) {
      return NextResponse.json({ success: false, message: "Your email address is already verified." }, { status: 409 });
    }

    await initializeDatabase();
    const db = await getDatabase();
    const rateLimit = await consumeAuthRateLimits(db, [
      { scope: "email-verification", identity: session.user.id, limit: 3 },
    ]);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many verification emails requested. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const userId = new ObjectId(session.user.id);
    const user = await db.collection("users").findOne(
      { _id: userId, status: "active" },
      { projection: { email: 1, emailVerified: 1 } },
    );
    if (!user?.email) {
      return NextResponse.json({ success: false, message: "Account email could not be found." }, { status: 404 });
    }
    if (user.emailVerified === true) {
      return NextResponse.json({ success: false, message: "Your email address is already verified." }, { status: 409 });
    }

    const now = new Date();
    const verification = createEmailVerificationToken(now);
    await db.collection("emailVerificationTokens").deleteMany({
      userId,
      usedAt: { $exists: false },
    });
    await db.collection("emailVerificationTokens").insertOne({
      userId,
      tokenHash: verification.tokenHash,
      expiresAt: verification.expiresAt,
      createdAt: now,
    });
    await sendVerificationEmail({
      to: user.email,
      token: verification.token,
      origin: new URL(request.url).origin,
    });

    return NextResponse.json({ success: true, message: "A new verification link has been sent to your email address." });
  } catch (error) {
    console.error("Email verification resend error:", error.message);
    return NextResponse.json(
      { success: false, message: "Could not send a verification email. Please try again later." },
      { status: 503 },
    );
  }
}
