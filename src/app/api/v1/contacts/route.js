import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { ensureMongoIndex } from "@/lib/mongo-indexes.mjs";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { normalizePhoneNumber } from "@/lib/contact-utils";
import { checkWorkspacePlanLimit } from "@/lib/plan-limits";
import { buildContactHistoryFilter, decodeContactCursor, encodeContactCursor } from "@/lib/contact-pagination.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const CONSENT_SOURCES = new Set([
  "website_form",
  "paper_form",
  "verbal",
  "whatsapp_initiated",
  "other",
]);

export async function GET(request) {
  const auth = await authenticateApiKey(request, "contacts:read");
  if (auth.error) return NextResponse.json(
    { success: false, message: auth.error },
    { status: auth.status, headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined },
  );
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const requestedLimit = rawLimit === null ? 100 : Number(rawLimit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
    return NextResponse.json({ success: false, message: "Limit must be an integer between 1 and 500." }, { status: 400 });
  }
  const limit = requestedLimit;
  const rawCursor = searchParams.get("before");
  const cursor = rawCursor ? decodeContactCursor(rawCursor) : null;
  if (rawCursor && !cursor) {
    return NextResponse.json({ success: false, message: "Invalid pagination cursor." }, { status: 400 });
  }

  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const filter = buildContactHistoryFilter(workspaceId, cursor);
  const db = await getDatabase();
  try {
    await ensureMongoIndex(db, "contacts", { workspaceId: 1, createdAt: -1, _id: -1 }, { name: "public_api_contact_history" });
  } catch (error) {
    console.error("Public API contact history index unavailable:", error);
    return NextResponse.json({ success: false, message: "Contact history is temporarily unavailable." }, { status: 503 });
  }
  const rows = await db.collection("contacts").find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).project({
    name: 1, phone: 1, tags: 1, createdAt: 1, optIn: 1,
  }).toArray();
  const hasMore = rows.length > limit;
  const contacts = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    success: true,
    data: contacts.map((contact) => ({
      id: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      tags: contact.tags || [],
      optedIn: contact.optIn?.status === true,
      createdAt: contact.createdAt || null,
    })),
    pagination: {
      limit,
      returned: contacts.length,
      hasMore,
      nextCursor: hasMore && contacts.length ? encodeContactCursor(contacts[contacts.length - 1]) : null,
    },
  });
}

export async function POST(request) {
  const auth = await authenticateApiKey(request, "contacts:write");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Request body must be a JSON object." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = normalizePhoneNumber(body.phone);
  const optedIn = body.optedIn === true;
  const rawTags = body.tags === undefined ? [] : body.tags;

  if (!name || name.length > 100 || !phone || (body.optedIn !== undefined && typeof body.optedIn !== "boolean")) {
    return NextResponse.json({ success: false, message: "Provide a name (1–100 characters), a valid international phone number, and a boolean optedIn value." }, { status: 400 });
  }
  if (!Array.isArray(rawTags) || rawTags.length > 10 || rawTags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > 30)) {
    return NextResponse.json({ success: false, message: "Tags must be an array of up to 10 non-empty strings, each no longer than 30 characters." }, { status: 400 });
  }

  const consentSource = typeof body.consentSource === "string" ? body.consentSource : "";
  const consentEvidence = typeof body.consentEvidence === "string" ? body.consentEvidence.trim() : "";
  if (optedIn && (!CONSENT_SOURCES.has(consentSource) || consentEvidence.length < 8 || consentEvidence.length > 500)) {
    return NextResponse.json({ success: false, message: "To mark a contact as opted in, provide a valid consentSource and consentEvidence (8–500 characters). Otherwise omit optedIn or set it to false." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const existing = await db.collection("contacts").findOne({ workspaceId, phone }, { projection: { _id: 1 } });
  if (existing) {
    return NextResponse.json({ success: false, code: "CONTACT_EXISTS", message: "A contact with this phone number already exists in this workspace.", contactId: existing._id.toString() }, { status: 409 });
  }

  const suppression = await db.collection("contactSuppressions").findOne({ workspaceId, phone, active: { $ne: false } }, { projection: { _id: 1 } });
  if (suppression) {
    return NextResponse.json({ success: false, code: "CONTACT_SUPPRESSED", message: "This phone number has opted out and cannot be re-added through the API. Record fresh consent through the workspace consent workflow." }, { status: 409 });
  }

  const quota = await checkWorkspacePlanLimit(db, workspaceId, "contacts", 1);
  if (!quota.allowed) {
    return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: quota.reason, plan: quota.plan, usage: quota.usage, limits: quota.limits }, { status: 429 });
  }

  const now = new Date();
  const tags = [...new Set(rawTags.map((tag) => tag.trim().toLowerCase()))];
  const contact = {
    workspaceId,
    name,
    phone,
    tags,
    optIn: {
      status: optedIn,
      source: optedIn ? "api_documented" : "api_unconfirmed",
      ...(optedIn ? { consentSource, evidence: consentEvidence, recordedAt: now } : {}),
      date: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await db.collection("contacts").insertOne(contact);
    return NextResponse.json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        name,
        phone,
        tags,
        optedIn,
        createdAt: now,
      },
    }, { status: 201 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, code: "CONTACT_EXISTS", message: "A contact with this phone number already exists in this workspace." }, { status: 409 });
    }
    console.error("Public API contact creation error:", error);
    return NextResponse.json({ success: false, message: "Could not create contact." }, { status: 500 });
  }
}
