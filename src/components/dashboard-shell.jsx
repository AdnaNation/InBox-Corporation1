"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Send,
  Settings,
  CreditCard,
  LogOut,
  Menu,
  X,
  MessageCircle,
  Plug,
  BarChart3,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/templates", label: "Templates", icon: MessageCircle },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/dashboard/team", label: "Team", icon: Users },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: Plug },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/usage", label: "Usage & limits", icon: BarChart3 },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/api-keys", label: "API access", icon: KeyRound },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardShell({ session, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const mobileNavigationRef = useRef(null);
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState("");
  // Avoid rendering a pathname-dependent active link until hydration is complete.
  // This keeps server HTML and the first client render identical, including when
  // Next.js rewrites or browser navigation affect the initial pathname.
  const [navigationReady, setNavigationReady] = useState(false);

  useEffect(() => {
    setNavigationReady(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusableElements = () => Array.from(
      mobileNavigationRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [],
    );

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        mobileNavigationRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
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
    } catch {
      setVerificationMessage("Could not send verification email. Please try again.");
    } finally {
      setVerificationSending(false);
    }
  }

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) {
      router.replace("/login");
      router.refresh();
    }
  }
  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      <Link
        href="/dashboard"
        className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-100 px-6 text-lg font-bold"
      >
        <span className="rounded-lg bg-green-600 p-2 text-white">
          <MessageCircle size={19} />
        </span>
        InBox Corporation
      </Link>
      <div className="shrink-0 px-4 py-5">
        <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Workspace
        </p>
        <div className="rounded-xl bg-slate-50 px-3 py-3">
          <p className="truncate text-sm font-semibold">
            {session.workspace.name}
          </p>
          <p className="mt-1 text-xs capitalize text-slate-500">
            {session.membership.role}
          </p>
        </div>
      </div>
      <nav aria-label="Dashboard navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-4">
        {[...links, ...(session.isPlatformAdmin ? [{ href: "/dashboard/platform-admin", label: "Platform admin", icon: ShieldCheck }] : [])].map(({ href, label, icon: Icon }) => {
          const active =
            navigationReady &&
            (pathname === href ||
              (href !== "/dashboard" && pathname.startsWith(href)));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-green-50 text-green-700" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-slate-100 bg-white p-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
            {session.user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {session.user.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {session.user.email}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
  return (
    <div className="min-h-screen lg:flex">
      <div className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold">
          <MessageCircle className="text-green-600" />
          InBox Corporation
        </Link>
        <button
          type="button"
          ref={menuButtonRef}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="mobile-dashboard-navigation"
          onClick={() => setOpen(!open)}
          className="rounded-lg p-2 hover:bg-slate-100"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      <div className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        {sidebar}
      </div>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-slate-950/30"
          />
          <div id="mobile-dashboard-navigation" ref={mobileNavigationRef} role="dialog" aria-modal="true" aria-label="Dashboard navigation" tabIndex={-1} className="relative h-full w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden shadow-xl">{sidebar}</div>
        </div>
      )}
      <main className="min-w-0 flex-1 pt-16 lg:ml-64 lg:pt-0">
        {session.user.emailVerified === false && (
          <section className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950 sm:px-8" aria-label="Email verification">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Verify your email address</p>
              <p className="mt-0.5 text-amber-800">Confirm {session.user.email} to help secure your account and make recovery easier.</p>
              {verificationMessage && <p className="mt-1" role="status">{verificationMessage}</p>}
            </div>
            <button
              type="button"
              onClick={resendVerificationEmail}
              disabled={verificationSending}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verificationSending ? "Sending…" : "Resend verification email"}
            </button>
          </section>
        )}
        {children}
      </main>
    </div>
  );
}
