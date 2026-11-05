import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDatabase } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { loginSchema } from "@/lib/schemas";
import { isSameOrigin } from "@/lib/security";
import { consumeAuthRateLimits } from "@/lib/auth-rate-limit";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { success: false, message: "Invalid request origin." },
        { status: 403 },
      );
    }

    const parsed = loginSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Enter a valid email and password." },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;
    const db = await getDatabase();
    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")?.trim()
      || "";
    const rateLimit = await consumeAuthRateLimits(db, [
      { scope: "login-email", identity: email, limit: 10 },
      ...(forwardedIp ? [{ scope: "login-ip", identity: forwardedIp, limit: 30 }] : []),
    ]);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many sign-in attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const user = await db.collection("users").findOne({
      email,
      status: "active",
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 },
      );
    }

    const membership = await db.collection("memberships").findOne(
      {
        userId: user._id,
        status: "active",
      },
      {
        sort: { createdAt: 1 },
      },
    );

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "No active workspace membership found." },
        { status: 403 },
      );
    }

    const workspace = await db.collection("workspaces").findOne({
      _id: membership.workspaceId,
      status: "active",
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, message: "Your workspace is missing or inactive." },
        { status: 403 },
      );
    }

    await createSession(user._id, workspace._id);

    return NextResponse.json({
      success: true,
      message: "Login successful.",
      redirect: "/dashboard",
    });
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to sign in." },
      { status: 500 },
    );
  }
}
