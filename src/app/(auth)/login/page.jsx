"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) return setError(data.message || "Login failed.");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><div className="w-full max-w-md">
    <Link href="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-bold"><span className="rounded-xl bg-green-600 p-2 text-white"><MessageCircle/></span>InBox Corporation</Link>
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold">Welcome back</h1><p className="mb-7 mt-2 text-sm text-slate-500">Sign in to your business workspace.</p>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium">Email address<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="you@example.com"/></label>
        <label className="block text-sm font-medium">Password<input type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="Your password"/></label>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60">{loading?<><Loader2 className="animate-spin" size={18}/>Signing in...</>:"Sign in"}</button>
        <p className="text-center text-sm text-slate-500">New here? <Link href="/register" className="font-semibold text-green-700">Create an account</Link></p>
      </form>
    </div>
  </div></main>;
}
