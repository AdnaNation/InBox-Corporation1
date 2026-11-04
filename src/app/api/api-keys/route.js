import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED_SCOPES = ["contacts:read"];

function canManage(session) {
  return ["owner", "admin"].includes(session?.membership?.role);
}

export async function GET() {
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can manage API keys." }, { status: 403 });
  const db = await getDatabase();
  const keys = await db.collection("apiKeys").find({
    workspaceId: new ObjectId(session.workspace.id),
  }).sort({ createdAt: -1 }).project({
    name: 1, prefix: 1, scopes: 1, status: 1, createdAt: 1, lastUsedAt: 1, revokedAt: 1,
  }).toArray();
  return NextResponse.json({ success: true, keys: keys.map((key) => ({
    id: key._id.toString(), name: key.name, prefix: key.prefix,
    scopes: key.scopes || [], status: key.status,
    createdAt: key.createdAt, lastUsedAt: key.lastUsedAt || null,
    revokedAt: key.revokedAt || null,
  })) });
}

export async function POST(request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can create API keys." }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 }); }
  const name = String(body.name || "").trim().slice(0, 60);
  const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes)] : [];
  if (!name) return NextResponse.json({ success: false, message: "Enter a name for this API key." }, { status: 400 });
  if (!scopes.length || scopes.some((scope) => !ALLOWED_SCOPES.includes(scope))) {
    return NextResponse.json({ success: false, message: "Select a supported permission." }, { status: 400 });
  }

  const db = await getDatabase();
  const now = new Date();
  const secret = `ibx_live_${randomBytes(32).toString("base64url")}`;
  const prefix = secret.slice(0, 16);
  await db.collection("apiKeys").insertOne({
    workspaceId: new ObjectId(session.workspace.id),
    createdBy: new ObjectId(session.user.id),
    name, prefix,
    keyHash: createHash("sha256").update(secret).digest("hex"),
    scopes, status: "active", createdAt: now, updatedAt: now,
  });
  return NextResponse.json({
    success: true,
    key: { secret, name, prefix, scopes, createdAt: now },
    message: "Copy this key now. It will not be shown again.",
  }, { status: 201 });
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can revoke API keys." }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!ObjectId.isValid(id || "")) return NextResponse.json({ success: false, message: "Invalid API key." }, { status: 400 });
  const db = await getDatabase();
  const result = await db.collection("apiKeys").updateOne({
    _id: new ObjectId(id), workspaceId: new ObjectId(session.workspace.id), status: "active",
  }, { $set: { status: "revoked", revokedAt: new Date(), updatedAt: new Date() } });
  if (!result.matchedCount) return NextResponse.json({ success: false, message: "Active API key not found." }, { status: 404 });
  return NextResponse.json({ success: true, message: "API key revoked." });
}
