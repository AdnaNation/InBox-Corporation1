import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contactSchema } from "@/lib/schemas";
import { normalizePhoneNumbers } from "@/lib/contact-utils";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const db = await getDatabase();

  const contacts = await db
    .collection("contacts")
    .find({
      workspaceId: new ObjectId(session.workspace.id),
    })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();

  return NextResponse.json({
    success: true,
    contacts: contacts.map((contact) => ({
      id: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      optedIn: contact.optIn?.status === true,
      tags: contact.tags || [],
      createdAt: contact.createdAt?.toISOString(),
    })),
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

  const newNumbers = valid.filter((number) => !existingNumbers.has(number));

  if (newNumbers.length === 0) {
    return NextResponse.json({
      success: true,
      message: "All provided numbers already exist.",
      contacts: [],
      added: 0,
      duplicates: existingNumbers.size,
      invalid,
    });
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

    const insertedContacts = documents.map((contact, index) => ({
      id: result.insertedIds[index].toString(),
      name: contact.name,
      phone: contact.phone,
      optedIn: true,
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
        invalid,
      },
      { status: 201 },
    );
  } catch (error) {
    // unordered insertMany may insert valid records before reporting duplicates.
    if (error.code === 11000 || error.writeErrors) {
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
        added: saved.length - existingNumbers.size,
        duplicates: existingNumbers.size,
        invalid,
      });
    }

    console.error("Contact creation error:", error);

    return NextResponse.json(
      { success: false, message: "Could not save contacts." },
      { status: 500 },
    );
  }
}
