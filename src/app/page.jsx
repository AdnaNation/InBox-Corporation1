import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, BarChart3, CheckCircle2, ChevronRight, Code2, MessageCircle,
  MessagesSquare, ShieldCheck, Users, Workflow,
} from "lucide-react";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wavo — WhatsApp conversations, campaigns and customer care",
  description: "Bring WhatsApp customer conversations, opted-in contacts, compliant campaigns and team workflows together with Wavo by InBox Corporation.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Wavo by InBox Corporation",
    description: "One workspace for WhatsApp customer conversations, contacts and campaigns.",
    images: ["/logo.png"],
  },
};

const features = [
  {
    icon: MessagesSquare,
    title: "Shared WhatsApp inbox",
    description: "Keep customer conversations in one team workspace, with conversation context and notes your team can act on.",
  },
  {
    icon: Users,
    title: "Organised customer contacts",
    description: "Import contacts, organise them with tags and groups, and keep consent and opt-out status visible.",
  },
  {
    icon: Workflow,
    title: "Campaigns with control",
    description: "Build audiences from your contacts, use approved WhatsApp templates, review recipients and control campaign delivery.",
  },
  {
    icon: BarChart3,
    title: "Useful performance insights",
    description: "Understand message activity, delivery outcomes and campaign progress with workspace analytics.",
  },
  {
    icon: ShieldCheck,
    title: "Workspace access and safety",
    description: "Invite teammates, manage roles, protect customer data and keep messaging permissions scoped to your workspace.",
  },
  {
    icon: Code2,
    title: "APIs and webhooks",
    description: "Connect your existing systems with scoped API keys and signed event webhooks.",
  },
];

const steps = [
  ["Create your workspace", "Register your business account and invite the people who handle customer conversations."],
  ["Connect WhatsApp", "Connect an eligible WhatsApp Business Account using Meta's authorised connection flow."],
  ["Bring your contacts", "Import contacts only where you have the required permission to message them."],
  ["Start conversations", "Manage replies in your shared inbox or prepare a reviewed campaign using an approved template."],
];

export default async function HomePage() {
  const session = await getSession();
  if (session?.workspace?.id) redirect("/dashboard");

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-900">
      <header className="relative z-10 border-b border-slate-200/80 bg-white/95">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8" aria-label="Main navigation">
          <Link href="/" className="flex items-center gap-3" aria-label="Wavo home">
            <img src="/logo.png" alt="" className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-xl font-extrabold tracking-tight">Wavo<span className="text-emerald-600">.</span></span>
            <span className="hidden border-l border-slate-200 pl-3 text-xs font-medium text-slate-500 sm:inline">by InBox Corporation</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/#pricing-transparency" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 md:inline-flex">Pricing &amp; Meta fees</Link>
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:px-4">Sign in</Link>
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700">
              Get started <ArrowRight size={16} />
            </Link>
          </div>
        </nav>
      </header>

      <section className="relative isolate bg-slate-950 text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.25),transparent_48%),radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.16),transparent_45%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:py-32">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> WhatsApp business workspace
            </div>
            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Every WhatsApp conversation. <span className="text-emerald-400">One clearer workflow.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Wavo helps your business organise customer contacts, manage team conversations and run carefully reviewed WhatsApp campaigns from one workspace.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400">
                Create your workspace <ArrowRight size={17} />
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10">
                Sign in to Wavo
              </Link>
            </div>
            <p className="mt-5 text-xs leading-6 text-slate-400">WhatsApp Business Platform access and Meta approvals are required for connected messaging features.</p>
          </div>

          <div className="mx-auto w-full max-w-xl">
            <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-3 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="rounded-2xl bg-white p-5 text-slate-900 sm:p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><MessageCircle size={21} /></div>
                    <div><p className="text-sm font-bold">Team inbox</p><p className="text-xs text-slate-500">Customer conversations</p></div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Workspace</span>
                </div>
                <div className="space-y-3 py-5">
                  <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">AR</div>
                    <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">Customer conversation</p><span className="text-[10px] text-slate-400">Inbox</span></div><p className="mt-1 text-xs leading-5 text-slate-500">A customer message is ready for your team to review and reply.</p></div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50/80 p-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">WA</div>
                    <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">Campaign review</p><span className="text-[10px] text-emerald-700">Draft</span></div><p className="mt-1 text-xs leading-5 text-slate-600">Check the audience and approved template before queuing.</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-xl border border-slate-100 p-3"><p className="text-xs text-slate-500">Contacts</p><p className="mt-1 text-xl font-extrabold">Organised</p><p className="mt-1 text-[10px] text-slate-400">Tags and groups</p></div>
                    <div className="rounded-xl border border-slate-100 p-3"><p className="text-xs text-slate-500">Insights</p><p className="mt-1 text-xl font-extrabold">Visible</p><p className="mt-1 text-[10px] text-slate-400">Delivery and activity</p></div>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><CheckCircle2 size={15} className="text-emerald-600" /> A focused workspace for your customer messaging</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Built for day-to-day work</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Move from scattered chats to a connected workflow.</h2>
          <p className="mt-4 leading-7 text-slate-600">Give your team the tools to manage customer relationships responsibly, without losing sight of consent, context or delivery.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg hover:shadow-slate-900/5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={21} /></div>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Getting started</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Set up your workspace in four steps.</h2>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {steps.map(([title, description], index) => (
              <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{index + 1}</span>
                <div><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{description}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Responsible messaging</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Built around permission and control.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Wavo includes consent-aware contact and campaign workflows. Your business remains responsible for obtaining permission, respecting opt-outs and following WhatsApp and applicable legal requirements.</p>
            <Link href="/terms" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-800">Read our service terms <ChevronRight size={16} /></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Opt-in status and consent records", "Opt-out suppression checks", "Approved template workflows", "24-hour messaging window controls"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700"><CheckCircle2 size={18} className="shrink-0 text-emerald-600" />{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing-transparency" className="border-y border-slate-200 bg-slate-50 scroll-mt-8">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Pricing transparency</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Know the full messaging cost before you choose a plan.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">Your Wavo subscription covers use of the Wavo platform. Meta WhatsApp Business Platform message fees are separate and are billed by Meta to your connected WhatsApp Business Account. Meta rates vary by recipient country and message category, so review the official rates before purchasing a Wavo plan.</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <a href="https://whatsappbusiness.com/products/platform-pricing/" target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
              <span><span className="block text-sm font-bold text-slate-900">WhatsApp Business Platform pricing</span><span className="mt-1 block text-xs leading-5 text-slate-500">Meta's pricing overview and country rate information</span></span>
              <ArrowRight size={19} className="shrink-0 text-emerald-700 transition group-hover:translate-x-1" />
            </a>
            <a href="https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing" target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
              <span><span className="block text-sm font-bold text-slate-900">WhatsApp pricing documentation</span><span className="mt-1 block text-xs leading-5 text-slate-500">Detailed official pricing rules and billing documentation</span></span>
              <ArrowRight size={19} className="shrink-0 text-emerald-700 transition group-hover:translate-x-1" />
            </a>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">Wavo plan prices and Meta messaging fees are separate. Traditional SMS, if used through a separate provider, is also not included.</p>
        </div>
      </section>

      <section className="bg-emerald-700">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-14 text-white sm:px-8 md:flex-row md:items-center">
          <div><h2 className="text-2xl font-extrabold sm:text-3xl">Bring your customer messaging into focus.</h2><p className="mt-2 text-sm leading-6 text-emerald-50">Create a workspace and explore Wavo's tools for your business.</p></div>
          <Link href="/register" className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-800 transition hover:bg-emerald-50">Create an account <ArrowRight size={16} /></Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} InBox Corporation. Wavo business messaging workspace.</p>
          <div className="flex flex-wrap gap-5"><Link href="/terms" className="hover:text-slate-900">Terms of Service</Link><Link href="/privacy-policy" className="hover:text-slate-900">Privacy Policy</Link><Link href="/login" className="hover:text-slate-900">Sign in</Link></div>
        </div>
      </footer>
    </main>
  );
}
