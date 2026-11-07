import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import clientPromise from "@/lib/mongodb";
import { hashEmailVerificationToken } from "@/lib/email-verification.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  const tokenHash = hashEmailVerificationToken(token);
  if (!tokenHash) {
    return NextResponse.redirect(new URL("/login?verification=invalid", request.url));
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

    return NextResponse.redirect(new URL(
      verified ? "/dashboard?emailVerified=1" : "/login?verification=expired",
      request.url,
    ));
  } catch (error) {
    console.error("Email verification error:", error.message);
    return NextResponse.redirect(new URL("/login?verification=failed", request.url));
  } finally {
    if (session) await session.endSession();
  }
}
