import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getDatabase } from "@/lib/db";
import { initializeDatabase } from "@/lib/database";
import { createSession } from "@/lib/auth";

const COOKIE_MAX_AGE = 10 * 60;
const PROVIDERS = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  facebook: {
    clientId: () => process.env.FACEBOOK_CLIENT_ID,
    clientSecret: () => process.env.FACEBOOK_CLIENT_SECRET,
    authorizationUrl: "https://www.facebook.com/v26.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v26.0/oauth/access_token",
  },
};

function appOrigin(request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return (configured ? new URL(configured).origin : new URL(request.url).origin);
}

function callbackUrl(provider, request) {
  return `${appOrigin(request)}/api/auth/${provider}/callback`;
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

function randomValue() {
  return randomBytes(32).toString("base64url");
}

function errorRedirect(request, code) {
  return NextResponse.redirect(new URL(`/login?oauthError=${encodeURIComponent(code)}`, appOrigin(request)));
}

function clearOAuthCookies(response, provider) {
  for (const suffix of ["state", "verifier", "nonce"]) {
    response.cookies.set(`wavo_oauth_${provider}_${suffix}`, "", {
      ...cookieOptions(),
      maxAge: 0,
    });
  }
  return response;
}

export function startSocialOAuth(provider, request) {
  const config = PROVIDERS[provider];
  if (!config || !config.clientId() || (provider === "google" && !config.clientSecret()) || (provider === "facebook" && !config.clientSecret())) {
    return NextResponse.redirect(new URL("/login?oauthError=provider_not_configured", appOrigin(request)));
  }

  const state = randomValue();
  const verifier = randomValue();
  const nonce = randomValue();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId());
  url.searchParams.set("redirect_uri", callbackUrl(provider, request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  if (provider === "google") {
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "online");
  } else {
    url.searchParams.set("scope", "email,public_profile");
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(`wavo_oauth_${provider}_state`, state, cookieOptions());
  response.cookies.set(`wavo_oauth_${provider}_verifier`, verifier, cookieOptions());
  response.cookies.set(`wavo_oauth_${provider}_nonce`, nonce, cookieOptions());
  return response;
}

async function getGoogleProfile(tokens, expectedNonce) {
  if (!tokens.id_token) throw new Error("missing_google_identity");
  const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  if (payload.nonce !== expectedNonce || !payload.sub || !payload.email || payload.email_verified !== true) {
    throw new Error("google_identity_not_verified");
  }
  return {
    providerUserId: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 80) : String(payload.email).split("@")[0],
    emailVerified: true,
  };
}

async function getFacebookProfile(accessToken) {
  const url = new URL("https://graph.facebook.com/v26.0/me");
  url.searchParams.set("fields", "id,name,email");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
  const profile = await response.json();
  if (!response.ok || !profile.id || !profile.email) {
    throw new Error("facebook_email_unavailable");
  }
  return {
    providerUserId: String(profile.id),
    email: String(profile.email).trim().toLowerCase(),
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 80) : String(profile.email).split("@")[0],
    // Facebook only returns the email field when the user grants the email permission.
    emailVerified: false,
  };
}

async function exchangeCode(provider, code, verifier, request) {
  const config = PROVIDERS[provider];
  const body = new URLSearchParams({
    client_id: config.clientId(),
    client_secret: config.clientSecret(),
    redirect_uri: callbackUrl(provider, request),
    code,
  });
  if (provider === "google") body.set("code_verifier", verifier);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const responseText = await response.text();
  let tokens;
  try {
    tokens = responseText ? JSON.parse(responseText) : {};
  } catch {
    tokens = {};
  }
  if (!response.ok || !tokens.access_token) {
    // Provider error codes/descriptions are safe to log; never log tokens or credentials.
    const providerError = typeof tokens.error === "string" ? tokens.error.slice(0, 80) : "unknown_error";
    const providerDescription = typeof tokens.error_description === "string"
      ? tokens.error_description.replace(/[\r\n\t]+/g, " ").slice(0, 240)
      : "no_description";
    console.error(
      `[${provider.toUpperCase()} OAUTH] Token exchange rejected:`,
      `http=${response.status}`,
      `error=${providerError}`,
      `description=${providerDescription}`,
    );
    throw new Error(`oauth_token_exchange_failed:${providerError}`);
  }
  return tokens;
}

async function findActiveWorkspace(db, userId) {
  const membership = await db.collection("memberships").findOne(
    { userId, status: "active" },
    { sort: { createdAt: 1 } },
  );
  if (!membership) return null;
  const workspace = await db.collection("workspaces").findOne({
    _id: membership.workspaceId,
    status: "active",
  });
  return workspace ? { workspace, membership } : null;
}

async function createSocialAccount(db, profile, provider) {
  const userId = new ObjectId();
  const workspaceId = new ObjectId();
  const now = new Date();
  const slugBase = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || "business";
  const slug = `${slugBase}-${workspaceId.toString().slice(-8)}`;
  const client = await clientPromise;
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection("users").insertOne({
        _id: userId,
        name: profile.name,
        email: profile.email,
        emailVerified: profile.emailVerified,
        role: "user",
        status: "active",
        authProviders: [provider],
        createdAt: now,
        updatedAt: now,
      }, { session });
      await db.collection("workspaces").insertOne({
        _id: workspaceId,
        name: `${profile.name}'s Workspace`,
        slug,
        ownerId: userId,
        status: "active",
        subscription: { plan: "free", status: "active" },
        createdAt: now,
        updatedAt: now,
      }, { session });
      await db.collection("memberships").insertOne({
        userId,
        workspaceId,
        role: "owner",
        status: "active",
        createdAt: now,
      }, { session });
      await db.collection("oauthAccounts").insertOne({
        provider,
        providerUserId: profile.providerUserId,
        userId,
        email: profile.email,
        createdAt: now,
        updatedAt: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return { userId, workspaceId };
}

export async function completeSocialOAuth(provider, request) {
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) return errorRedirect(request, "provider_not_supported");

  const cookies = request.cookies;
  const expectedState = cookies.get(`wavo_oauth_${provider}_state`)?.value;
  const verifier = cookies.get(`wavo_oauth_${provider}_verifier`)?.value;
  const nonce = cookies.get(`wavo_oauth_${provider}_nonce`)?.value;
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");

  if (!expectedState || !state || state !== expectedState || !code) {
    return clearOAuthCookies(errorRedirect(request, "oauth_state_invalid"), provider);
  }

  try {
    const tokens = await exchangeCode(provider, code, verifier, request);
    const profile = provider === "google"
      ? await getGoogleProfile(tokens, nonce)
      : await getFacebookProfile(tokens.access_token);

    await initializeDatabase();
    const db = await getDatabase();
    const linked = await db.collection("oauthAccounts").findOne({
      provider,
      providerUserId: profile.providerUserId,
    });

    let userId;
    let workspaceId;
    if (linked) {
      const user = await db.collection("users").findOne({ _id: linked.userId, status: "active" });
      if (!user) return clearOAuthCookies(errorRedirect(request, "account_unavailable"), provider);
      const active = await findActiveWorkspace(db, user._id);
      if (!active) return clearOAuthCookies(errorRedirect(request, "workspace_unavailable"), provider);
      userId = user._id;
      workspaceId = active.workspace._id;
    } else {
      const existingUser = await db.collection("users").findOne({ email: profile.email }, { projection: { _id: 1 } });
      if (existingUser) {
        return clearOAuthCookies(errorRedirect(request, "account_exists_sign_in_first"), provider);
      }
      const created = await createSocialAccount(db, profile, provider);
      userId = created.userId;
      workspaceId = created.workspaceId;
    }

    await createSession(userId, workspaceId);
    const response = NextResponse.redirect(new URL("/dashboard", appOrigin(request)));
    return clearOAuthCookies(response, provider);
  } catch (error) {
    console.error(`[${provider.toUpperCase()} OAUTH] Callback failed:`, error.message);
    const code = error.code === 11000 ? "account_exists_sign_in_first" : "oauth_failed";
    return clearOAuthCookies(errorRedirect(request, code), provider);
  }
}
