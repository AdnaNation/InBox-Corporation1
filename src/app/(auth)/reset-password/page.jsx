"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!token) return setError("This password reset link is invalid or expired.");
    if (form.password !== form.confirmPassword) return setError("The passwords do not match.");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: form.password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not update your password.");
      router.replace("/login?passwordReset=success");
    } catch (requestError) {
      setError(requestError.message || "Could not update your password.");
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
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="mb-7 mt-2 text-sm text-slate-500">Use at least 8 characters. Your other active sessions will be signed out.</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input type="password" required minLength={8} maxLength={72} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="At least 8 characters" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm new password
            <input type="password" required minLength={8} maxLength={72} value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="Enter the password again" />
          </label>
          <button disabled={loading || !token} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60">
            {loading ? <><Loader2 className="animate-spin" size={18} />Updating…</> : "Update password"}
          </button>
          <p className="text-center text-sm text-slate-500"><Link href="/login" className="font-semibold text-green-700">Back to sign in</Link></p>
        </form>
      </div>
    </div>
  </main>;
}
