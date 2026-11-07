import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { getDatabase } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { registerSchema } from "@/lib/schemas";
import { initializeDatabase } from "@/lib/database";
import { isSameOrigin } from "@/lib/security";
import { consumeAuthRateLimits } from "@/lib/auth-rate-limit.mjs";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";

export async function POST(request) {
  let session;
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ success:false, message:"Invalid request origin." }, { status:403 });
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success:false, message:"Please check your information.", errors:parsed.error.flatten().fieldErrors }, { status:400 });

    const { name, email, password } = parsed.data;
    if (Buffer.byteLength(password, "utf8") > 72) return NextResponse.json({ success:false, message:"Password is too long." }, { status:400 });

    await initializeDatabase();
    const db = await getDatabase();
    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")?.trim()
      || "";
    const rateLimit = await consumeAuthRateLimits(db, [
      { scope: "register-email", identity: email, limit: 3 },
      ...(forwardedIp ? [{ scope: "register-ip", identity: forwardedIp, limit: 5 }] : []),
    ]);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }
    const existing = await db.collection("users").findOne({ email }, { projection:{_id:1} });
    if (existing) return NextResponse.json({ success:false, message:"An account with this email already exists." }, { status:409 });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = new ObjectId();
    const workspaceId = new ObjectId();
    const now = new Date();
    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,35) || "business";
    const slug = `${slugBase}-${workspaceId.toString().slice(-8)}`;

    const client = await clientPromise;
    session = client.startSession();
    await session.withTransaction(async () => {
      await db.collection("users").insertOne({
        _id:userId, name, email, passwordHash,
        emailVerified:false, role:"user", status:"active",
        createdAt:now, updatedAt:now
      }, { session });
      await db.collection("workspaces").insertOne({
        _id:workspaceId, name:`${name}'s Workspace`, slug, ownerId:userId,
        status:"active", subscription:{plan:"free",status:"active"},
        createdAt:now, updatedAt:now
      }, { session });
      await db.collection("memberships").insertOne({
        userId, workspaceId, role:"owner", status:"active", createdAt:now
      }, { session });
    });

    await createSession(userId, workspaceId);
    return NextResponse.json({ success:true, message:"Account created.", redirect:"/dashboard" }, { status:201 });
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === 11000) return NextResponse.json({success:false,message:"An account with this email already exists."},{status:409});
    return NextResponse.json({success:false,message:"Registration failed. Please try again."},{status:500});
  } finally {
    if (session) await session.endSession();
  }
}
