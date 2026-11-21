"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity, BarChart3, CreditCard, KeyRound, LayoutDashboard, LogOut,
  Menu, MessageCircle, MessageSquare, Plug, Send, Settings, ShieldCheck,
  Users, X,
} from "lucide-react";

const primaryLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard/templates", label: "Templates", icon: MessageCircle },
];
const workspaceLinks = [
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: Plug },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/usage", label: "Usage & limits", icon: Activity },
];
const accountLinks = [
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/api-keys", label: "API access", icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function NavigationGroup({ title, items, pathname, navigationReady, onNavigate }) {
  return (
    <div className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">{title}</p>
      <div className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = navigationReady && (pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));
          return (
            <Link key={href} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined}
              className={"group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors " +
                (active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")}>
              {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-emerald-700" />}
              <Icon size={17} strokeWidth={1.8} className={active ? "text-emerald-700" : "text-slate-400 group-hover:text-slate-600"} />
              <span className="flex-1">{label}</span>
              {label === "Inbox" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Live</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardShell({ session, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [navigationReady, setNavigationReady] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavigationRef = useRef(null);

  useEffect(() => setNavigationReady(true), []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(mobileNavigationRef.current?.querySelectorAll('a[href],button:not([disabled])') || []);
    focusable()[0]?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [open]);

  async function resendVerificationEmail() {
    setVerificationSending(true);
    setVerificationMessage("");
    try {
      const response = await fetch("/api/auth/verification/resend", { method: "POST" });
      const result = await response.json();
      setVerificationMessage(result.message || (response.ok ? "Verification email sent." : "Could not send verification email."));
    } catch { setVerificationMessage("Could not send verification email. Please try again."); }
    finally { setVerificationSending(false); }
  }
  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) { router.replace("/login"); router.refresh(); }
  }

  const adminLinks = session.isPlatformAdmin ? [{ href: "/dashboard/platform-admin", label: "Platform admin", icon: ShieldCheck }] : [];
  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col border-r border-[#e7ece8] bg-white">
      <Link href="/dashboard" className="flex h-[68px] shrink-0 items-center gap-3 border-b border-slate-100 px-5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#087f5b] text-white shadow-sm shadow-emerald-900/15"><MessageCircle size={19} strokeWidth={2} /></span>
        <span className="min-w-0"><span className="block text-[15px] font-semibold tracking-[-.03em] text-slate-950">InBox Corporation<span className="text-emerald-700">.</span></span><span className="block text-[10px] text-slate-400">by InBox Corporation</span></span>
      </Link>

      <div className="shrink-0 px-4 pb-4 pt-5">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Workspace</p>
        <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-[#fafcfb] p-3 text-left">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e8f3ed] text-xs font-semibold text-emerald-800">{(session.workspace.name || "W").slice(0,1).toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{session.workspace.name}</span><span className="mt-0.5 block text-[10px] capitalize text-slate-500">{session.membership.role} workspace</span></span>
        </div>
      </div>

      <nav aria-label="Dashboard navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        <NavigationGroup title="Workspace" items={primaryLinks} pathname={pathname} navigationReady={navigationReady} onNavigate={() => setOpen(false)} />
        <NavigationGroup title="Manage" items={workspaceLinks} pathname={pathname} navigationReady={navigationReady} onNavigate={() => setOpen(false)} />
        <NavigationGroup title="Account" items={accountLinks} pathname={pathname} navigationReady={navigationReady} onNavigate={() => setOpen(false)} />
        {adminLinks.length > 0 && <NavigationGroup title="Administration" items={adminLinks} pathname={pathname} navigationReady={navigationReady} onNavigate={() => setOpen(false)} />}
      </nav>

      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{(session.user.name || "U").slice(0,1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{session.user.name}</p><p className="truncate text-[10px] text-slate-500">{session.user.email}</p></div>
          <button type="button" onClick={logout} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"><LogOut size={16}/></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f7f9f7] lg:flex">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-[252px] lg:block">{sidebar}</div>
      <div className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#087f5b] text-white"><MessageCircle size={17}/></span><span className="text-sm font-semibold tracking-tight">InBox Corporation<span className="text-emerald-700">.</span></span></Link>
        <button type="button" ref={menuButtonRef} aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="mobile-dashboard-navigation" onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">{open ? <X size={19}/> : <Menu size={19}/>}</button>
      </div>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><button aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-950/30"/><div id="mobile-dashboard-navigation" ref={mobileNavigationRef} role="dialog" aria-modal="true" aria-label="Dashboard navigation" tabIndex={-1} className="relative h-full w-[min(270px,calc(100vw-48px))] overflow-hidden shadow-2xl">{sidebar}</div></div>}
      <main className="min-w-0 flex-1 pt-[60px] lg:ml-[252px] lg:pt-0">
        <div className="sticky top-0 z-20 hidden h-[54px] items-center justify-between border-b border-slate-200/70 bg-white/85 px-7 backdrop-blur lg:flex">
          <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-medium text-slate-800">{primaryLinks.find((item) => item.href === pathname)?.label || [...workspaceLinks,...accountLinks,...adminLinks].find((item) => pathname.startsWith(item.href))?.label || "Workspace"}</span><span className="text-slate-300">/</span><span>{session.workspace.name}</span></div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600"/><span>Workspace active</span></div>
        </div>
        {session.user.emailVerified === false && (
          <section className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 sm:px-8" aria-label="Email verification">
            <div className="min-w-0 flex-1"><p className="font-semibold">Verify your email address</p><p className="mt-0.5 text-amber-800">Confirm {session.user.email} to help secure your account and make recovery easier.</p>{verificationMessage && <p className="mt-1" role="status">{verificationMessage}</p>}</div>
            <button type="button" onClick={resendVerificationEmail} disabled={verificationSending} className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60">{verificationSending ? "Sending…" : "Resend verification email"}</button>
          </section>
        )}
        {children}
      </main>
    </div>
  );
}
