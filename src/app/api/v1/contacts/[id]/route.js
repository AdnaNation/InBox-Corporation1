import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { findActiveContactSuppression } from "@/lib/contact-suppression.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await authenticateApiKey(request, "contacts:read");
  if (auth.error) return NextResponse.json(
    { success: false, message: auth.error },
    { status: auth.status, headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined },
  );

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) {
    return NextResponse.json({ success: false, message: "A valid contact ID is required." }, { status: 400 });
  }

  const db = await getDatabase();
  const contact = await db.collection("contacts").findOne(
    { _id: new ObjectId(id), workspaceId: new ObjectId(auth.apiKey.workspaceId) },
    { projection: { name: 1, phone: 1, tags: 1, optIn: 1, createdAt: 1, updatedAt: 1 } },
  );

  // Keep IDs from other workspaces indistinguishable from missing contacts.
  if (!contact) {
    return NextResponse.json({ success: false, message: "Contact not found in this workspace." }, { status: 404 });
  }

  let suppression;
  try {
    suppression = await findActiveContactSuppression(db, new ObjectId(auth.apiKey.workspaceId), contact.phone);
  } catch (error) {
    console.error("Public API contact suppression lookup failed:", error);
    return NextResponse.json({ success: false, message: "Contact consent status is temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      tags: contact.tags || [],
      optedIn: contact.optIn?.status === true,
      suppressed: Boolean(suppression),
      consentSource: contact.optIn?.consentSource || null,
      consentedAt: contact.optIn?.date || contact.optIn?.recordedAt || null,
      revokedAt: contact.optIn?.revokedAt || null,
      createdAt: contact.createdAt || null,
      updatedAt: contact.updatedAt || null,
    },
  });
}

export async function PATCH(request, { params }) {
  const auth = await authenticateApiKey(request, "contacts:write");
  if (auth.error) return NextResponse.json(
    { success: false, message: auth.error },
    { status: auth.status, headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined },
  );

  const { id } = await params;
  if (!ObjectId.isValid(id || "")) {
    return NextResponse.json({ success: false, message: "A valid contact ID is required." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Request body must be a JSON object." }, { status: 400 });
  }

  const allowedFields = new Set(["name", "tags"]);
  const suppliedFields = Object.keys(body);
  if (!suppliedFields.length || suppliedFields.some((field) => !allowedFields.has(field))) {
    return NextResponse.json({ success: false, message: "Only name and tags can be updated through this endpoint. Consent and phone changes are not supported." }, { status: 400 });
  }

  const updates = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
      return NextResponse.json({ success: false, message: "Name must contain 1–100 characters." }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "tags")) {
    if (!Array.isArray(body.tags) || body.tags.length > 10 || body.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 30)) {
      return NextResponse.json({ success: false, message: "Tags must be an array of up to 10 non-empty strings, each no longer than 30 characters." }, { status: 400 });
    }
    updates.tags = [...new Set(body.tags.map((tag) => tag.trim().toLowerCase()))];
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const result = await db.collection("contacts").findOneAndUpdate(
    { _id: new ObjectId(id), workspaceId },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after", projection: { name: 1, phone: 1, tags: 1, optIn: 1, updatedAt: 1 } },
  );

  const contact = result?.value ?? result;
  if (!contact) {
    return NextResponse.json({ success: false, message: "Contact not found in this workspace." }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      tags: contact.tags || [],
      optedIn: contact.optIn?.status === true,
      updatedAt: contact.updatedAt || null,
    },
  });
}
