import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contactSchema } from "@/lib/schemas";
import { normalizePhoneNumbers } from "@/lib/contact-utils";
import { isSameOrigin } from "@/lib/security";
import { reserveWorkspaceContactUsage, releaseWorkspaceContactUsage } from "@/lib/plan-limits";
import { buildContactQueryFilter, decodeContactCursor, encodeContactCursor } from "@/lib/contact-pagination.mjs";

export const runtime = "nodejs";

export async function GET(request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") || 200);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 200, 1), 200);
  const query = (searchParams.get("q") || "").trim().slice(0, 100);
  const tag = (searchParams.get("tag") || "").trim().toLowerCase().slice(0, 30);
  const cursorValue = searchParams.get("cursor");
  const cursor = cursorValue ? decodeContactCursor(cursorValue) : null;
  if (cursorValue && !cursor) {
    return NextResponse.json({ success: false, message: "Invalid contact pagination cursor." }, { status: 400 });
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const filter = buildContactQueryFilter(workspaceId, { cursor, query, tag });

  const [rows, availableTags] = await Promise.all([
    db.collection("contacts")
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray(),
    db.collection("contacts").distinct("tags", { workspaceId }),
  ]);

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const suppressedRows = await db.collection("contactSuppressions").find({
    workspaceId,
    phone: { $in: rows.map((contact) => contact.phone) },
    active: { $ne: false },
  }).project({ phone: 1 }).toArray();
  const suppressedPhones = new Set(suppressedRows.map((item) => item.phone));
  const lastContact = rows.at(-1);

  return NextResponse.json({
    success: true,
    contacts: rows.map((contact) => ({
      id: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      optedIn: contact.optIn?.status === true,
      suppressed: suppressedPhones.has(contact.phone),
      tags: contact.tags || [],
      createdAt: contact.createdAt?.toISOString(),
    })),
    availableTags: availableTags.filter((value) => typeof value === "string").sort(),
    pagination: {
      limit,
      hasMore,
      nextCursor: hasMore && lastContact ? encodeContactCursor(lastContact) : null,
    },
  });
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { success: false, message: "Invalid origin." },
      { status: 403 },
    );
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = contactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Enter a valid name, phone number and confirm WhatsApp consent.",
        errors: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { name, phone, optedIn, tags } = parsed.data;

  const { valid, invalid } = normalizePhoneNumbers(phone);

  if (valid.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "No valid international phone numbers were provided.",
        invalid,
      },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const collection = db.collection("contacts");

  // Check existing numbers before inserting.
  const existingContacts = await collection
    .find({
      workspaceId,
      phone: { $in: valid },
    })
    .project({ phone: 1 })
    .toArray();

  const existingNumbers = new Set(
    existingContacts.map((contact) => contact.phone),
  );

  const suppressions = await db.collection("contactSuppressions")
    .find({ workspaceId, phone: { $in: valid }, active: { $ne: false } })
    .project({ phone: 1 })
    .toArray();
  const suppressedNumbers = new Set(suppressions.map((item) => item.phone));
  const allowedNumbers = valid.filter((number) => !suppressedNumbers.has(number));
  const newNumbers = allowedNumbers.filter((number) => !existingNumbers.has(number));

  if (newNumbers.length === 0) {
    return NextResponse.json({
      success: true,
      message: suppressedNumbers.size
        ? "Suppressed numbers were excluded. No new contacts were added."
        : "All provided numbers already exist.",
      contacts: [],
      added: 0,
      duplicates: existingNumbers.size,
      suppressed: [...suppressedNumbers],
      invalid,
    });
  }

  const quota = await reserveWorkspaceContactUsage(db, workspaceId, newNumbers.length);
  if (!quota.allowed) {
    return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: quota.reason, plan: quota.plan, usage: quota.usage, limits: quota.limits }, { status: 429 });
  }

  const now = new Date();

  const documents = newNumbers.map((number, index) => ({
    workspaceId,
    name: newNumbers.length === 1 ? name : `${name} ${index + 1}`,
    phone: number,
    tags: [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))],
    optIn: {
      status: optedIn,
      source: "manual",
      recordedBy: new ObjectId(session.user.id),
      date: now,
    },
    createdAt: now,
    updatedAt: now,
  }));

  try {
    const result = await collection.insertMany(documents, {
      ordered: false,
    });
    const unusedReservation = newNumbers.length - result.insertedCount;
    if (unusedReservation > 0) await releaseWorkspaceContactUsage(db, workspaceId, unusedReservation);

    const insertedContacts = documents.map((contact, index) => ({
      id: result.insertedIds[index].toString(),
      name: contact.name,
      phone: contact.phone,
      optedIn: contact.optIn.status === true,
      tags: contact.tags,
      createdAt: now.toISOString(),
    }));

    return NextResponse.json(
      {
        success: true,
        message: `${insertedContacts.length} contact(s) added successfully.`,
        contacts: insertedContacts,
        added: insertedContacts.length,
        duplicates: existingNumbers.size,
        suppressed: [...suppressedNumbers],
        invalid,
      },
      { status: 201 },
    );
  } catch (error) {
    // unordered insertMany may insert valid records before reporting duplicates.
    if (error.code === 11000 || error.writeErrors) {
      const insertedCount = error?.result?.insertedCount;
      if (Number.isInteger(insertedCount) && newNumbers.length > insertedCount) {
        await releaseWorkspaceContactUsage(db, workspaceId, newNumbers.length - insertedCount);
      }
      const saved = await collection
        .find({
          workspaceId,
          phone: { $in: newNumbers },
        })
        .sort({ createdAt: -1 })
        .toArray();

      return NextResponse.json({
        success: true,
        message: "Contacts processed. Some numbers already existed.",
        contacts: saved.map((contact) => ({
          id: contact._id.toString(),
          name: contact.name,
          phone: contact.phone,
          optedIn: contact.optIn?.status === true,
          createdAt: contact.createdAt?.toISOString(),
        })),
        added: Number(error?.result?.insertedCount || 0),
        duplicates: existingNumbers.size + newNumbers.length - Number(error?.result?.insertedCount || 0),
        suppressed: [...suppressedNumbers],
        invalid,
      });
    }

    // Preserve reservations when the database write outcome is ambiguous.
    console.error("Contact creation error:", error);

    return NextResponse.json(
      { success: false, message: "Could not save contacts." },
      { status: 500 },
    );
  }
}
