"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck, MessageCircle } from "lucide-react";

export default function VerifyEmailClient() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") || "";
    setToken(value);
    setReady(true);
    // Remove the bearer-like token from the visible URL and browser history
    // after reading it. The token is still held only in component state.
    window.history.replaceState({}, "", "/verify-email");
    if (!value) setError("This verification link is invalid or expired.");
  }, []);

  async function confirm(event) {
    event.preventDefault();
    if (!token || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not verify your email.");
      router.replace(result.redirectTo || "/login?verification=success");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not verify your email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-bold">
          <span className="rounded-xl bg-green-600 p-2 text-white"><MessageCircle /></span>
          InBox Corporation
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><MailCheck size={28} /></span>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">Confirm your email address</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Press the button below to finish verifying your Wavo account. Simply opening this page will not use your verification link.</p>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <form onSubmit={confirm} className="mt-6">
            <button type="submit" disabled={!ready || !token || loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <><Loader2 className="animate-spin" size={18} />Verifying…</> : "Verify email address"}
            </button>
          </form>
          <p className="mt-5 text-sm text-slate-500"><Link href="/login" className="font-semibold text-green-700 hover:text-green-800">Back to sign in</Link></p>
        </div>
      </div>
    </main>
  );
}
