import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import clientPromise from "@/lib/mongodb";
import { hashEmailVerificationToken } from "@/lib/email-verification.mjs";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!hashEmailVerificationToken(token)) {
    return NextResponse.redirect(new URL("/login?verification=invalid", request.url), {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  // Email security scanners often follow links automatically. A GET must never
  // consume a one-time token; the user confirms on the interstitial page.
  const destination = new URL("/verify-email", request.url);
  destination.searchParams.set("token", token);
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid verification request." }, { status: 400 });
  }

  const tokenHash = hashEmailVerificationToken(body?.token);
  if (!tokenHash) {
    return NextResponse.json({ success: false, message: "This verification link is invalid or expired." }, { status: 400 });
  }

  let session;
  try {
    const client = await clientPromise;
    const db = await getDatabase();
    session = client.startSession();
    let verified = false;
    await session.withTransaction(async () => {
      const now = new Date();
      const claim = await db.collection("emailVerificationTokens").findOneAndUpdate(
        { tokenHash, usedAt: { $exists: false }, expiresAt: { $gt: now } },
        { $set: { usedAt: now } },
        { session, returnDocument: "before", includeResultMetadata: false },
      );
      const tokenRecord = claim?.value ?? claim;
      if (!tokenRecord) return;

      const result = await db.collection("users").updateOne(
        { _id: tokenRecord.userId, status: "active" },
        { $set: { emailVerified: true, emailVerifiedAt: now, updatedAt: now } },
        { session },
      );
      if (!result.matchedCount) throw new Error("Verification account is no longer active.");
      verified = true;
    });

    if (!verified) {
      return NextResponse.json({ success: false, message: "This verification link has expired or has already been used." }, { status: 410 });
    }
    const currentSession = await getSession();
    return NextResponse.json({
      success: true,
      message: "Your email address has been verified.",
      redirectTo: currentSession ? "/dashboard?emailVerified=1" : "/login?verification=success",
    });
  } catch (error) {
    console.error("Email verification error:", error.message);
    return NextResponse.json({ success: false, message: "We could not verify your email right now. Please try again." }, { status: 500 });
  } finally {
    if (session) await session.endSession();
  }
}
