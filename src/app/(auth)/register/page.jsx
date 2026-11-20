"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, MessageCircle, UserPlus } from "lucide-react";
import SocialAuthButtons from "@/components/social-auth-buttons";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }
  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) { setError(data.message || "Registration failed."); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch { setError("Unable to create your account. Please try again."); }
    finally { setLoading(false); }
  }

  const inputClass = "mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10";

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]">
      <section className="relative hidden overflow-hidden bg-[#10251d] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_15%,rgba(16,185,129,.22),transparent_42%),linear-gradient(145deg,transparent_45%,rgba(5,80,55,.5))]"/>
        <Link href="/" className="relative flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white"><MessageCircle size={20}/></span><span className="text-lg font-semibold tracking-tight">Wavo<span className="text-emerald-400">.</span></span></Link>
        <div className="relative max-w-xl pb-10"><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-emerald-300">A calmer way to connect</p><h1 className="mt-5 text-5xl font-semibold leading-[1.08] tracking-[-.055em] xl:text-6xl">Build better customer relationships, together.</h1><p className="mt-6 max-w-md text-sm leading-7 text-emerald-50/70">Start with one shared workspace for WhatsApp conversations, customer contacts and thoughtful campaigns.</p><div className="mt-10 space-y-4 text-xs text-emerald-50/75">{["Bring your customer context together","Give your team a shared place to respond","Keep consent and campaign controls in view"].map((item)=><p key={item} className="flex items-center gap-3"><CheckCircle2 size={16} className="text-emerald-300"/>{item}</p>)}</div></div>
        <p className="relative text-[11px] text-emerald-100/45">Wavo by InBox Corporation</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[390px]">
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5 text-sm font-semibold text-slate-900 lg:hidden"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#087f5b] text-white"><MessageCircle size={17}/></span>Wavo<span className="text-emerald-700">.</span></Link>
          <div className="mb-8"><div className="mb-5 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600"><UserPlus size={18}/></div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-700">Get started</p><h2 className="mt-2 text-[30px] font-semibold tracking-[-.045em] text-slate-950">Create your workspace</h2><p className="mt-2 text-sm text-slate-500">Set up your account. You can invite your team later.</p></div>
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-700">Full name<input name="name" autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={handleChange} placeholder="Your name" className={inputClass}/></label>
            <label className="block text-xs font-semibold text-slate-700">Work email<input name="email" type="email" autoComplete="email" required value={form.email} onChange={handleChange} placeholder="you@company.com" className={inputClass}/></label>
            <label className="block text-xs font-semibold text-slate-700">Password<span className="relative mt-2 block"><input name="password" type={showPassword?"text":"password"} autoComplete="new-password" required minLength={8} maxLength={72} value={form.password} onChange={handleChange} placeholder="At least 8 characters" className={inputClass+" pr-11"}/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?"Hide password":"Show password"} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-700">{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></span><span className="mt-1.5 block text-[10px] font-normal text-slate-400">Use at least 8 characters.</span></label>
            <button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#087f5b] text-sm font-semibold text-white transition hover:bg-[#066447] disabled:cursor-not-allowed disabled:opacity-60">{loading?<><Loader2 className="animate-spin" size={17}/>Creating workspace…</>:<>Create account <ArrowRight size={16}/></>}</button>
          </form>
          <div className="my-6"><SocialAuthButtons/></div>
          <p className="text-center text-xs text-slate-500">Already have an account? <Link href="/login" className="font-semibold text-emerald-800 hover:text-emerald-950">Sign in</Link></p>
          <p className="mt-12 text-center text-[10px] leading-5 text-slate-400">By creating an account, you agree to our <Link href="/terms" className="underline underline-offset-2 hover:text-slate-600">terms</Link> and <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-slate-600">privacy policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
