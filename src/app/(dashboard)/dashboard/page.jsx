import { getSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getWorkspacePlanUsage } from "@/lib/plan-limits";
import { ObjectId } from "mongodb";
import {
  ArrowRight, BarChart3, CheckCircle2, ArrowUpRight, MessageCircle,
  Plug, Send, Users,
} from "lucide-react";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const formatNumber = (value) => new Intl.NumberFormat().format(value || 0);
const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

export default async function DashboardPage() {
  const session = await getSession();
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const [contacts, optedInContacts, campaigns, whatsappAccounts, planState] = await Promise.all([
    db.collection("contacts").countDocuments({ workspaceId }),
    db.collection("contacts").countDocuments({ workspaceId, "optIn.status": true }),
    db.collection("campaigns").countDocuments({ workspaceId }),
    db.collection("whatsappAccounts").countDocuments({ workspaceId, status: "connected" }),
    getWorkspacePlanUsage(db, workspaceId),
  ]);

  const steps = [
    { title: "Add your contacts", desc: optedInContacts > 0 ? `${formatNumber(optedInContacts)} opted-in contacts are ready in your workspace.` : "Import customers and record their WhatsApp consent.", href: "/dashboard/contacts", complete: optedInContacts > 0, number: "01" },
    { title: "Connect WhatsApp", desc: whatsappAccounts > 0 ? `${formatNumber(whatsappAccounts)} WhatsApp number(s) connected.` : "Connect your official WhatsApp Business Platform account.", href: "/dashboard/whatsapp", complete: whatsappAccounts > 0, number: "02" },
    { title: "Create a campaign", desc: campaigns > 0 ? `${formatNumber(campaigns)} campaign(s) created.` : "Prepare an approved template for opted-in contacts.", href: "/dashboard/campaigns", complete: campaigns > 0, number: "03" },
  ];
  const completedSteps = steps.filter((step) => step.complete).length;
  const cards = [
    { label: "Total contacts", value: contacts, note: `${formatNumber(optedInContacts)} opted in`, icon: Users, href: "/dashboard/contacts" },
    { label: "Campaigns", value: campaigns, note: "Created in this workspace", icon: Send, href: "/dashboard/campaigns" },
    { label: "WhatsApp numbers", value: whatsappAccounts, note: whatsappAccounts ? "Connected and available" : "Connection needed", icon: MessageCircle, href: "/dashboard/whatsapp" },
    { label: "Current plan", value: titleCase(planState.plan), note: planState.workspaceStatus === "active" ? "Workspace active" : "Workspace suspended", icon: BarChart3, href: "/dashboard/usage", isText: true },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-7 px-4 py-7 sm:px-7 sm:py-9">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-700">{session.workspace.name}</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-.045em] text-slate-950 sm:text-[34px]">Good to see you, {session.user.name.split(" ")[0]}.</h1>
          <p className="mt-2 text-sm text-slate-500">Here's a clear view of your WhatsApp workspace today.</p>
        </div>
        <Link href="/dashboard/inbox" className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-[#087f5b] px-4 text-xs font-semibold text-white transition hover:bg-[#066447] sm:self-auto">Open inbox <ArrowRight size={15}/></Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">
        {cards.map(({ label, value, note, icon: Icon, href, isText }) => (
          <Link key={label} href={href} className="group rounded-xl border border-slate-200/90 bg-white p-4 transition-colors hover:border-emerald-200 sm:p-5">
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-slate-500">{label}</span><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#eff6f1] text-emerald-800"><Icon size={16} strokeWidth={1.8}/></span></div>
            <p className={"mt-5 truncate font-semibold tracking-[-.04em] text-slate-950 " + (isText ? "text-2xl" : "text-[32px] tabular-nums")}>{isText ? value : formatNumber(value)}</p>
            <div className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-[11px] text-slate-400">{note}</span><ArrowRight size={14} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-700"/></div>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.8fr)]">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div><h2 className="text-sm font-semibold text-slate-900">Workspace setup</h2><p className="mt-1 text-xs text-slate-500">A few essentials to get your team moving.</p></div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-slate-600">{completedSteps} / {steps.length} complete</span>
          </div>
          <div className="p-3 sm:p-4">
            {steps.map((step, index) => (
              <Link key={step.href} href={step.href} className="group flex items-center gap-4 rounded-lg px-3 py-4 transition hover:bg-[#f7faf8]">
                <span className={"grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-semibold " + (step.complete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{step.complete ? <CheckCircle2 size={18}/> : step.number}</span>
                <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-slate-800">{step.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{step.desc}</span></span>
                <span className="hidden text-[11px] font-medium text-emerald-700 group-hover:block">{step.complete ? "View" : "Set up"}</span><ArrowRight size={15} className="shrink-0 text-slate-300 group-hover:text-emerald-700"/>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Usage this month</h2><p className="mt-1 text-xs text-slate-500">Your plan at a glance</p></div><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600"><BarChart3 size={16}/></span></div>
          <div className="mt-6 space-y-5">
            {[
              { label: "Contacts", current: contacts, limit: planState.limits.contacts },
              { label: "Messages", current: planState.usage.messages, limit: planState.limits.messages },
              { label: "Campaigns", current: planState.usage.campaigns, limit: planState.limits.campaigns },
            ].map((item) => {
              const ratio = Number.isFinite(item.limit) && item.limit > 0 ? Math.min(100, Math.round((item.current / item.limit) * 100)) : 0;
              return <div key={item.label}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-600">{item.label}</span><span className="tabular-nums text-slate-500">{formatNumber(item.current)} <span className="text-slate-300">/</span> {formatNumber(item.limit)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${ratio}%` }}/></div></div>;
            })}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4"><Link href="/dashboard/usage" className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 hover:text-emerald-950">Review usage and limits <ArrowUpRight size={15}/></Link></div>
          <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#f5f8f5] px-3 py-2.5 text-[11px] text-slate-600"><Plug size={14} className="text-emerald-700"/><span>WhatsApp status</span><span className={"ml-auto font-semibold " + (whatsappAccounts > 0 ? "text-emerald-700" : "text-amber-700")}>{whatsappAccounts > 0 ? "Connected" : "Not connected"}</span></div>
        </section>
      </div>
    </div>
  );
}
