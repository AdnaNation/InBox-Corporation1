"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2, Eye, EyeOff } from "lucide-react";
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
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) return setError(data.message || "Registration failed.");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to create your account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return <AuthShell title="Create your account" subtitle="Start your WhatsApp business workspace.">
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Field label="Full name"><input name="name" required minLength={2} maxLength={80} value={form.name} onChange={handleChange} placeholder="Your name" className={inputClass}/></Field>
      <Field label="Email address"><input name="email" type="email" required value={form.email} onChange={handleChange} placeholder="you@example.com" className={inputClass}/></Field>
      <Field label="Password"><div className="relative"><input name="password" type={showPassword?"text":"password"} required minLength={8} maxLength={72} value={form.password} onChange={handleChange} placeholder="At least 8 characters" className={`${inputClass} pr-12`}/><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-4 top-3.5 text-slate-400">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></Field>
      <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60">{loading?<><Loader2 className="animate-spin" size={18}/>Creating account...</>:"Create account"}</button>
    </form>
    <div className="mt-5"><SocialAuthButtons /></div>
    <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link href="/login" className="font-semibold text-green-700">Sign in</Link></p>
  </AuthShell>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100";
function Field({label,children}) { return <label className="block text-sm font-medium text-slate-700">{label}<div className="mt-2">{children}</div></label>; }
function AuthShell({title,subtitle,children}) { return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12"><div className="w-full max-w-md"><Link href="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-bold"><span className="rounded-xl bg-green-600 p-2 text-white"><MessageCircle/></span>InBox Corporation</Link><div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">{title}</h1><p className="mt-2 mb-7 text-sm text-slate-500">{subtitle}</p>{children}</div></div></main>; }
