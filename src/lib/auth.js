import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";

const COOKIE_NAME = "wavo_session";
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters");
}
const key = new TextEncoder().encode(secret);

export async function createSession(userId, workspaceId) {
  const token = await new SignJWT({ workspaceId: workspaceId.toString() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId.toString())
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession() {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;

    if (!token) {
      console.log("[AUTH] No session cookie found");
      return null;
    }

    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    if (
      !payload.sub ||
      !payload.workspaceId ||
      !ObjectId.isValid(payload.sub) ||
      !ObjectId.isValid(payload.workspaceId)
    ) {
      console.log("[AUTH] Invalid JWT payload");
      return null;
    }

    const db = await getDatabase();
    const userId = new ObjectId(payload.sub);
    const workspaceId = new ObjectId(payload.workspaceId);

    const [user, workspace, membership] = await Promise.all([
      db.collection("users").findOne({
        _id: userId,
        status: "active",
      }),
      db.collection("workspaces").findOne({
        _id: workspaceId,
        status: "active",
      }),
      db.collection("memberships").findOne({
        userId,
        workspaceId,
        status: "active",
      }),
    ]);

    if (!user) console.log("[AUTH] Active user not found");
    if (!workspace) console.log("[AUTH] Active workspace not found");
    if (!membership) console.log("[AUTH] Active membership not found");

    if (!user || !workspace || !membership) {
      return null;
    }

    // A password reset invalidates every JWT issued before the password change.
    if (user.passwordChangedAt instanceof Date
      && Number(payload.iat || 0) * 1000 < user.passwordChangedAt.getTime()) {
      return null;
    }

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified === true,
        role: user.role,
      },
      workspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
      },
      membership: {
        role: membership.role,
      },
    };
  } catch (error) {
    console.error("[AUTH] Session error:", error.message);
    return null;
  }
}

export async function destroySession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
