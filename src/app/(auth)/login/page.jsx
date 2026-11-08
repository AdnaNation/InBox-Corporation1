"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2 } from "lucide-react";
import SocialAuthButtons from "@/components/social-auth-buttons";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
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
    if (passwordReset === "success") {
      setVerificationNotice("Your password has been updated. Sign in with your new password.");
      return;
    }
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
      {verificationNotice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{verificationNotice}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-medium">Email address<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="you@example.com"/></label>
        <label className="block text-sm font-medium">Password<input type="password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" placeholder="Your password"/></label>
        <p className="-mt-3 text-right text-sm"><Link href="/forgot-password" className="font-semibold text-green-700 hover:text-green-800">Forgot password?</Link></p>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60">{loading?<><Loader2 className="animate-spin" size={18}/>Signing in...</>:"Sign in"}</button>
      </form>
      <div className="mt-5"><SocialAuthButtons /></div>
      <p className="mt-5 text-center text-sm text-slate-500">New here? <Link href="/register" className="font-semibold text-green-700">Create an account</Link></p>
    </div>
  </div></main>;
}
