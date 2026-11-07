import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizePhoneNumber } from "@/lib/contact-utils";
import { isSameOrigin } from "@/lib/security";
import { checkWorkspacePlanLimit } from "@/lib/plan-limits";

export const runtime = "nodejs";

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i++;

      row.push(cell.trim());

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());

  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  if (insideQuotes) {
    throw new Error("Your CSV contains an unclosed quotation mark.");
  }

  return rows;
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
      { success: false, message: "Unauthorized." },
      { status: 401 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const consentConfirmed = formData.get("consentConfirmed");

    if (consentConfirmed !== "true") {
      return NextResponse.json(
        {
          success: false,
          message: "Please confirm that all contacts have opted in.",
        },
        { status: 400 },
      );
    }

    if (!file || typeof file.text !== "function") {
      return NextResponse.json(
        { success: false, message: "Please select a CSV file." },
        { status: 400 },
      );
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { success: false, message: "Only CSV files are supported." },
        { status: 400 },
      );
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: "CSV file must be smaller than 2 MB." },
        { status: 400 },
      );
    }

    const text = (await file.text()).replace(/^\uFEFF/, "");
    const rows = parseCSV(text);

    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, message: "The CSV has no contact rows." },
        { status: 400 },
      );
    }

    const headers = rows[0].map((header) => header.trim().toLowerCase());

    const nameIndex = headers.indexOf("name");
    const phoneIndex = headers.indexOf("phone");

    if (nameIndex === -1 || phoneIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          message: 'CSV must contain "name" and "phone" columns.',
        },
        { status: 400 },
      );
    }

    const dataRows = rows.slice(1);

    if (dataRows.length > 500) {
      return NextResponse.json(
        {
          success: false,
          message: "Maximum 500 contacts are allowed per upload.",
        },
        { status: 400 },
      );
    }

    const validContacts = [];
    const invalidRows = [];
    const seenNumbers = new Set();
    let duplicateRows = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const name = row[nameIndex]?.trim();
      const rawPhone = row[phoneIndex]?.trim();
      const phone = normalizePhoneNumber(rawPhone);

      if (!name || name.length > 100 || !phone) {
        invalidRows.push({
          row: i + 2,
          reason: !name
            ? "Missing or invalid name"
            : !phone
              ? "Invalid phone number"
              : "Name is too long",
        });
        continue;
      }

      if (seenNumbers.has(phone)) {
        duplicateRows++;
        continue;
      }

      seenNumbers.add(phone);
      validContacts.push({ name, phone });
    }

    if (validContacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No valid contacts found.",
        added: 0,
        duplicates: duplicateRows,
        invalid: invalidRows,
      });
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const userId = new ObjectId(session.user.id);
    const now = new Date();

    const suppressionRows = await db.collection("contactSuppressions")
      .find({ workspaceId, phone: { $in: validContacts.map((contact) => contact.phone) }, active: { $ne: false } })
      .project({ phone: 1 })
      .toArray();
    const suppressedNumbers = new Set(suppressionRows.map((item) => item.phone));
    const importableContacts = validContacts.filter((contact) => !suppressedNumbers.has(contact.phone));
    const existingRows = importableContacts.length
      ? await db.collection("contacts")
        .find({ workspaceId, phone: { $in: importableContacts.map((contact) => contact.phone) } })
        .project({ phone: 1 })
        .toArray()
      : [];
    const existingNumbers = new Set(existingRows.map((item) => item.phone));
    const newContacts = importableContacts.filter((contact) => !existingNumbers.has(contact.phone));
    const duplicates = duplicateRows + existingNumbers.size;

    if (newContacts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new contacts to import. Existing and suppressed numbers were skipped.",
        added: 0,
        duplicates,
        suppressed: suppressedNumbers.size,
        invalid: invalidRows,
      });
    }

    // Only genuinely new contacts consume plan capacity. Re-importing an
    // existing CSV must not be rejected just because the workspace is full.
    const quota = await checkWorkspacePlanLimit(db, workspaceId, "contacts", newContacts.length);
    if (!quota.allowed) {
      return NextResponse.json({ success: false, code: "PLAN_LIMIT_REACHED", message: quota.reason, plan: quota.plan, usage: quota.usage, limits: quota.limits }, { status: 429 });
    }

    const operations = newContacts.map((contact) => ({
      updateOne: {
        filter: {
          workspaceId,
          phone: contact.phone,
        },
        update: {
          $setOnInsert: {
            workspaceId,
            name: contact.name,
            phone: contact.phone,
            optIn: {
              status: true,
              source: "csv_import",
              recordedBy: userId,
              date: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }));

    const result = await db.collection("contacts").bulkWrite(operations, {
      ordered: false,
    });

    return NextResponse.json({
      success: true,
      message: "CSV import completed.",
      added: result.upsertedCount,
      duplicates: duplicates + newContacts.length - result.upsertedCount,
      suppressed: suppressedNumbers.size,
      invalid: invalidRows,
    });
  } catch (error) {
    console.error("CSV contact import error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message || "Could not import contacts. Please check your CSV.",
      },
      { status: 500 },
    );
  }
}
