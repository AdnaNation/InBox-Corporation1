import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { encodeContactCursor } from "@/lib/contact-pagination.mjs";
import ContactsClient from "@/components/contacts-client";

export const runtime = "nodejs";

export default async function ContactsPage() {
  const session = await getSession();
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const pageSize = 200;

  const [rows, availableTags] = await Promise.all([
    db.collection("contacts")
      .find({ workspaceId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .toArray(),
    db.collection("contacts").distinct("tags", { workspaceId }),
  ]);

  const hasMore = rows.length > pageSize;
  if (hasMore) rows.pop();

  const suppressedRows = await db.collection("contactSuppressions").find({
    workspaceId,
    phone: { $in: rows.map((contact) => contact.phone) },
    active: { $ne: false },
  }).project({ phone: 1 }).toArray();
  const suppressedPhones = new Set(suppressedRows.map((item) => item.phone));
  const lastContact = rows.at(-1);

  const safeContacts = rows.map(({ _id, name, phone, optIn, tags, createdAt }) => ({
    id: _id.toString(),
    name,
    phone,
    tags: Array.isArray(tags) ? tags : [],
    optedIn: optIn?.status === true,
    suppressed: suppressedPhones.has(phone),
    createdAt: createdAt?.toISOString(),
  }));

  const initialPagination = {
    limit: pageSize,
    hasMore,
    nextCursor: hasMore && lastContact ? encodeContactCursor(lastContact) : null,
  };

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage customers who have given permission to receive WhatsApp messages.
        </p>
      </div>
      <ContactsClient
        initialContacts={safeContacts}
        initialPagination={initialPagination}
        initialTags={availableTags.filter((tag) => typeof tag === "string").sort()}
      />
    </div>
  );
}
