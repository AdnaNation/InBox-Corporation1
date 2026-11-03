import { getSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { Users, Send, MessageCircle, TrendingUp, Plug, ArrowRight } from "lucide-react";
import Link from "next/link";

export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getSession();
  const db = await getDatabase();
  const workspaceId = (await import("mongodb")).ObjectId.createFromHexString(session.workspace.id);
  const [contacts,campaigns,whatsapp] = await Promise.all([
    db.collection("contacts").countDocuments({workspaceId}),
    db.collection("campaigns").countDocuments({workspaceId}),
    db.collection("whatsappAccounts").findOne({workspaceId,status:"connected"},{projection:{_id:1}})
  ]);
  const cards = [
    {label:"Contacts",value:contacts,icon:Users},
    {label:"Campaigns",value:campaigns,icon:Send},
    {label:"WhatsApp accounts",value:whatsapp?1:0,icon:MessageCircle},
    {label:"Delivery rate",value:"—",icon:TrendingUp}
  ];
  return <div className="mx-auto max-w-7xl p-5 sm:p-8">
    <div className="mb-8"><p className="text-sm text-slate-500">{session.workspace.name}</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Welcome, {session.user.name}</h1><p className="mt-2 text-sm text-slate-500">Here's what's happening in your workspace.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({label,value,icon:Icon})=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><span className="rounded-xl bg-green-50 p-2.5 text-green-700"><Icon size={19}/></span></div><p className="mt-5 text-3xl font-bold">{value}</p></div>)}</div>
    <div className="mt-6 grid gap-5 xl:grid-cols-3"><section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2"><h2 className="font-semibold">Get started</h2><p className="mt-1 text-sm text-slate-500">Complete the essentials to prepare your workspace.</p><div className="mt-6 space-y-4">{[{title:"Add your contacts",desc:"Import or add customers who have opted in.",href:"/dashboard/contacts"},{title:"Connect WhatsApp",desc:"Configure your official WhatsApp Cloud API account.",href:"/dashboard/whatsapp"},{title:"Prepare a campaign",desc:"Send approved templates to opted-in contacts.",href:"/dashboard/campaigns"}].map((item,i)=><Link href={item.href} key={item.href} className="flex items-center gap-4 rounded-xl border border-slate-100 p-4 hover:border-green-200 hover:bg-green-50/40"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">{i+1}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.desc}</span></span><ArrowRight size={17} className="text-slate-400"/></Link>)}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-semibold">Plan overview</h2><div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Current plan</p><p className="mt-1 text-2xl font-bold">Free</p><p className="mt-2 text-xs text-slate-500">Plan limits and billing will be configurable in a later release.</p></div><div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Plug size={17}/>WhatsApp connection: <span className={whatsapp?"text-green-700":"text-amber-700"}>{whatsapp?"Connected":"Not connected"}</span></div></section></div>
  </div>;
}
