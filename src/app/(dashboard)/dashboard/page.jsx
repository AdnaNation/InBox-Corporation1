import { getSession } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { getWorkspacePlanUsage } from "@/lib/plan-limits";
import { ObjectId } from "mongodb";
import { Users, Send, MessageCircle, TrendingUp, Plug, ArrowRight, CheckCircle2, Circle } from "lucide-react";
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
    {
      title: "Add your contacts",
      desc: optedInContacts > 0
        ? `${formatNumber(optedInContacts)} opted-in contact(s) ready in your workspace.`
        : "Import or add customers and record their WhatsApp consent.",
      href: "/dashboard/contacts",
      complete: optedInContacts > 0,
    },
    {
      title: "Connect WhatsApp",
      desc: whatsappAccounts > 0
        ? `${formatNumber(whatsappAccounts)} WhatsApp number(s) connected.`
        : "Connect your official WhatsApp Business Platform account.",
      href: "/dashboard/whatsapp",
      complete: whatsappAccounts > 0,
    },
    {
      title: "Create your first campaign",
      desc: campaigns > 0
        ? `${formatNumber(campaigns)} campaign(s) created.`
        : "Prepare an approved template campaign for opted-in contacts.",
      href: "/dashboard/campaigns",
      complete: campaigns > 0,
    },
  ];
  const completedSteps = steps.filter((step) => step.complete).length;
  const cards = [
    { label: "Contacts", value: contacts, icon: Users },
    { label: "Campaigns", value: campaigns, icon: Send },
    { label: "WhatsApp accounts", value: whatsappAccounts, icon: MessageCircle },
    { label: "Delivery rate", value: "—", icon: TrendingUp },
  ];

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <div className="mb-8">
        <p className="text-sm text-slate-500">{session.workspace.name}</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Welcome, {session.user.name}</h1>
        <p className="mt-2 text-sm text-slate-500">Here's what's happening in your workspace.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <span className="rounded-xl bg-green-50 p-2.5 text-green-700"><Icon size={19} /></span>
            </div>
            <p className="mt-5 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Get started</h2>
              <p className="mt-1 text-sm text-slate-500">Complete the essentials to prepare your workspace.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {completedSteps} of {steps.length} completed
            </span>
          </div>
          <div className="mt-6 space-y-3">
            {steps.map((step, index) => (
              <Link
                href={step.href}
                key={step.href}
                className="flex items-center gap-4 rounded-xl border border-slate-100 p-4 transition hover:border-green-200 hover:bg-green-50/40"
              >
                {step.complete
                  ? <CheckCircle2 size={22} className="shrink-0 text-green-600" />
                  : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{step.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{step.desc}</span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-slate-400" />
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">Plan overview</h2>
          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Current plan</p>
            <p className="mt-1 text-2xl font-bold">{titleCase(planState.plan)}</p>
            <p className="mt-2 text-xs text-slate-500">
              {planState.workspaceStatus === "active" ? "Workspace active" : "Workspace suspended"}
            </p>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Contacts</span>
              <span className="font-medium tabular-nums">{formatNumber(contacts)} / {formatNumber(planState.limits.contacts)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Messages this month</span>
              <span className="font-medium tabular-nums">{formatNumber(planState.usage.messages)} / {formatNumber(planState.limits.messages)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Campaigns this month</span>
              <span className="font-medium tabular-nums">{formatNumber(planState.usage.campaigns)} / {formatNumber(planState.limits.campaigns)}</span>
            </div>
          </div>
          <Link href="/dashboard/usage" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-green-700 hover:text-green-800">
            View usage and limits <ArrowRight size={16} />
          </Link>
          <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-sm text-slate-500">
            <Plug size={17} />
            WhatsApp connection:
            <span className={whatsappAccounts > 0 ? "text-green-700" : "text-amber-700"}>
              {whatsappAccounts > 0 ? "Connected" : "Not connected"}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
