import { getSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { ObjectId } from "mongodb";
import CampaignClient from "@/components/campaign-client";

export const runtime = "nodejs";

export default async function CampaignsPage() {
  const session = await getSession();
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const [contacts,account,campaigns] = await Promise.all([
    db.collection("contacts").countDocuments({workspaceId,"optIn.status":true}),
    db.collection("whatsappAccounts").findOne({workspaceId,status:"connected"}),
    db.collection("campaigns").find({workspaceId}).sort({createdAt:-1}).limit(50).toArray()
  ]);
  return <div className="mx-auto max-w-7xl p-5 sm:p-8"><div className="mb-7"><h1 className="text-2xl font-bold">Campaigns</h1><p className="mt-1 text-sm text-slate-500">Send approved WhatsApp templates to opted-in contacts.</p></div><CampaignClient contactCount={contacts} connected={!!account} campaigns={campaigns.map(c=>({id:c._id.toString(),name:c.name,status:c.status,createdAt:c.createdAt?.toISOString(),total:c.total||1}))}/></div>;
}
