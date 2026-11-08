import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getDatabase } from "@/lib/db";
import { initializeDatabase } from "@/lib/database";
import { getSession } from "@/lib/auth";

const COOKIE_NAME = "wavo_facebook_link_state";
const COOKIE_MAX_AGE = 10 * 60;
const CALLBACK_PATH = "/api/auth/facebook/link/callback";
const GRAPH_VERSION = "v26.0";

function appOrigin(request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function callbackUrl(request) {
  return appOrigin(request) + CALLBACK_PATH;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  };
}

function clearState(response) {
  response.cookies.set(COOKIE_NAME, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}

function settingsRedirect(request, status) {
  return NextResponse.redirect(
    new URL("/dashboard/settings?facebookLink=" + encodeURIComponent(status), appOrigin(request)),
  );
}

export async function startFacebookAccountLink(request) {
  const session = await getSession();
  if (!session?.user?.id || !session?.workspace?.id) {
    return NextResponse.redirect(new URL("/login", appOrigin(request)));
  }
  if (!process.env.FACEBOOK_CLIENT_ID || !process.env.FACEBOOK_CLIENT_SECRET) {
    return settingsRedirect(request, "not-configured");
  }

  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = new URL("https://www.facebook.com/" + GRAPH_VERSION + "/dialog/oauth");
  authorizationUrl.searchParams.set("client_id", process.env.FACEBOOK_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", callbackUrl(request));
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "public_profile,email");
  authorizationUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(COOKIE_NAME, state, cookieOptions());
  return response;
}

export async function completeFacebookAccountLink(request) {
  const params = new URL(request.url).searchParams;
  const responseError = params.get("error");
  const expectedState = request.cookies.get(COOKIE_NAME)?.value;
  const state = params.get("state");
  const code = params.get("code");

  if (responseError) return clearState(settingsRedirect(request, "cancelled"));
  if (!expectedState || !state || state !== expectedState || !code) {
    return clearState(settingsRedirect(request, "invalid"));
  }

  try {
    const session = await getSession();
    if (!session?.user?.id || !session?.workspace?.id) {
      return clearState(NextResponse.redirect(new URL("/login", appOrigin(request))));
    }

    const tokenUrl = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/oauth/access_token");
    tokenUrl.searchParams.set("client_id", process.env.FACEBOOK_CLIENT_ID || "");
    tokenUrl.searchParams.set("client_secret", process.env.FACEBOOK_CLIENT_SECRET || "");
    tokenUrl.searchParams.set("redirect_uri", callbackUrl(request));
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || typeof tokens.access_token !== "string") {
      throw new Error("facebook_token_exchange_failed");
    }

    const profileUrl = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/me");
    profileUrl.searchParams.set("fields", "id,name,email");
    profileUrl.searchParams.set("access_token", tokens.access_token);
    const profileResponse = await fetch(profileUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error("facebook_identity_unavailable");

    await initializeDatabase();
    const db = await getDatabase();
    const userId = new ObjectId(session.user.id);
    const providerUserId = String(profile.id);
    const existingLink = await db.collection("oauthAccounts").findOne({
      provider: "facebook",
      providerUserId,
    });

    if (existingLink && !existingLink.userId.equals(userId)) {
      return clearState(settingsRedirect(request, "already-linked"));
    }

    if (!existingLink) {
      const client = await clientPromise;
      const mongoSession = client.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          const user = await db.collection("users").findOne(
            { _id: userId, status: "active" },
            { session: mongoSession, projection: { _id: 1 } },
          );
          if (!user) throw new Error("account_unavailable");

          await db.collection("oauthAccounts").insertOne({
            provider: "facebook",
            providerUserId,
            userId,
            email: typeof profile.email === "string" ? profile.email.trim().toLowerCase() : null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }, { session: mongoSession });

          await db.collection("users").updateOne(
            { _id: userId, status: "active" },
            { $addToSet: { authProviders: "facebook" }, $set: { updatedAt: new Date() } },
            { session: mongoSession },
          );
        });
      } finally {
        await mongoSession.endSession();
      }
    }

    return clearState(settingsRedirect(request, "connected"));
  } catch (error) {
    console.error("[FACEBOOK LINK] Account linking failed:", error.message);
    return clearState(settingsRedirect(request, "failed"));
  }
}
