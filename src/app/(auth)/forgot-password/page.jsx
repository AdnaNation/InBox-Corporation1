"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not process your request.");
      setNotice(result.message || "If an active account uses that address, a reset link will be sent.");
    } catch (requestError) {
      setError(requestError.message || "Could not process your request.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
    <div className="w-full max-w-md">
      <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-bold">
        <span className="rounded-xl bg-green-600 p-2 text-white"><MessageCircle /></span>
        InBox Corporation
      </Link>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="mb-7 mt-2 text-sm text-slate-500">Enter your account email. If it matches an active account, we will send a secure reset link.</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium text-slate-700">
            Email address
            <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="you@example.com" />
          </label>
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            {loading ? <><Loader2 className="animate-spin" size={18} />Sending…</> : "Send reset link"}
          </button>
          <p className="text-center text-sm text-slate-500"><Link href="/login" className="font-semibold text-green-700">Back to sign in</Link></p>
        </form>
      </div>
    </div>
  </main>;
}
