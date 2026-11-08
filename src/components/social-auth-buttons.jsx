"use client";

import { Chrome } from "lucide-react";

export default function SocialAuthButtons() {
  return (
    <div className="space-y-3">
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-400">Or continue with</span></div>
      </div>
      <a href="/api/auth/google" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
        <Chrome size={18} /> Google
      </a>
    </div>
  );
}
