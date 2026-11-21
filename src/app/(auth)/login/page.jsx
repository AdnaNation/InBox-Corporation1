"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, MessageCircle } from "lucide-react";
import SocialAuthButtons from "@/components/social-auth-buttons";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("verification");
    const passwordReset = params.get("passwordReset");
    const oauthErrors = {
      provider_not_configured: "This sign-in provider is not configured yet. Please try another sign-in method.",
      provider_not_supported: "That sign-in provider is not supported.",
      oauth_state_invalid: "Your sign-in session expired or could not be verified. Please try again.",
      oauth_token_exchange_failed: "The provider could not complete sign-in. Please try again.",
      google_identity_not_verified: "Google could not verify the email address for this account.",
      facebook_email_unavailable: "Facebook did not share an email address. Please allow the email permission or use another sign-in method.",
      account_exists_sign_in_first: "An account already exists with this email. Sign in with your password first; accounts are not linked automatically.",
      account_unavailable: "This account is unavailable. Contact support if you need help.",
      workspace_unavailable: "No active workspace is available for this account.",
      oauth_failed: "Social sign-in failed. Please try again.",
    };
    if (params.has("oauthError")) setError(oauthErrors[params.get("oauthError")] || oauthErrors.oauth_failed);
    if (passwordReset === "success") { setVerificationNotice("Your password has been updated. Sign in with your new password."); return; }
    const messages = {
      success: "Your email address is verified. You can now sign in.",
      expired: "This verification link has expired. Sign in and request a new one from your dashboard.",
      invalid: "This verification link is invalid.",
      failed: "We could not verify your email right now. Please try again.",
    };
    setVerificationNotice(messages[status] || "");
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) { setError(data.message || "Login failed."); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch { setError("Unable to sign in. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(420px,.9fr)]">
      <section className="relative hidden overflow-hidden bg-[#10251d] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_15%,rgba(16,185,129,.22),transparent_42%),linear-gradient(145deg,transparent_45%,rgba(5,80,55,.5))]"/>
        <Link href="/" className="relative flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white"><MessageCircle size={20}/></span><span className="text-lg font-semibold tracking-tight">InBox Corporation</span></Link>
        <div className="relative max-w-xl pb-10"><p className="text-[11px] font-semibold uppercase tracking-[.2em] text-emerald-300">One workspace. Better conversations.</p><h1 className="mt-5 text-5xl font-semibold leading-[1.08] tracking-[-.055em] xl:text-6xl">Make every customer conversation count.</h1><p className="mt-6 max-w-md text-sm leading-7 text-emerald-50/70">Bring your WhatsApp inbox, contacts and team workflows together. Pick up where your customers left off.</p><div className="mt-10 flex flex-wrap gap-5 text-xs text-emerald-50/75"><span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300"/> Shared team inbox</span><span className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-300"/> Consent-aware campaigns</span></div></div>
        <p className="relative text-[11px] text-emerald-100/45">InBox Corporation</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[390px]">
          <Link href="/" className="mb-12 inline-flex items-center gap-2.5 text-sm font-semibold text-slate-900 lg:hidden"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#087f5b] text-white"><MessageCircle size={17}/></span>InBox Corporation</Link>
          <div className="mb-8"><div className="mb-5 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600"><LockKeyhole size={18}/></div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-700">Welcome back</p><h2 className="mt-2 text-[30px] font-semibold tracking-[-.045em] text-slate-950">Sign in to InBox Corporation</h2><p className="mt-2 text-sm text-slate-500">Use your business account to continue.</p></div>
          {verificationNotice && <p role="status" className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800">{verificationNotice}</p>}
          {error && <p role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-700">Email address<input type="email" autoComplete="email" required value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10" placeholder="you@company.com"/></label>
            <label className="block text-xs font-semibold text-slate-700">Password<span className="relative mt-2 block"><input type={showPassword?"text":"password"} autoComplete="current-password" required value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 pr-11 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10" placeholder="Enter your password"/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?"Hide password":"Show password"} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-700">{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></span></label>
            <div className="-mt-1 text-right"><Link href="/forgot-password" className="text-xs font-semibold text-emerald-800 hover:text-emerald-950">Forgot password?</Link></div>
            <button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#087f5b] text-sm font-semibold text-white transition hover:bg-[#066447] disabled:cursor-not-allowed disabled:opacity-60">{loading?<><Loader2 className="animate-spin" size={17}/>Signing in…</>:<>Sign in <ArrowRight size={16}/></>}</button>
          </form>
          <div className="my-6"><SocialAuthButtons/></div>
          <p className="text-center text-xs text-slate-500">New to InBox Corporation? <Link href="/register" className="font-semibold text-emerald-800 hover:text-emerald-950">Create an account</Link></p>
          <p className="mt-12 text-center text-[10px] text-slate-400">By continuing, you agree to use InBox Corporation in accordance with our <Link href="/terms" className="underline underline-offset-2 hover:text-slate-600">terms</Link> and <Link href="/privacy-policy" className="underline underline-offset-2 hover:text-slate-600">privacy policy</Link>.</p>
        </div>
      </section>
    </main>
  );
}
