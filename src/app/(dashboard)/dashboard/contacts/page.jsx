import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ObjectId } from "mongodb";
import ContactsClient from "@/components/contacts-client";

export const runtime = "nodejs";

export default async function ContactsPage() {
  const session = await getSession();
  const db = await getDatabase();
  const contacts = await db.collection("contacts").find({
    workspaceId: new ObjectId(session.workspace.id)
  }).sort({createdAt:-1}).limit(200).toArray();

  const safeContacts = contacts.map(({_id,name,phone,optIn,tags,createdAt})=>({
    id:_id.toString(),
    name,
    phone,
    tags: Array.isArray(tags) ? tags : [],
    optedIn: !!optIn?.status,
    createdAt: createdAt?.toISOString()
  }));

  return <div className="mx-auto max-w-7xl p-5 sm:p-8"><div className="mb-7"><h1 className="text-2xl font-bold">Contacts</h1><p className="mt-1 text-sm text-slate-500">Manage customers who have given permission to receive WhatsApp messages.</p></div><ContactsClient initialContacts={safeContacts}/></div>;
}
