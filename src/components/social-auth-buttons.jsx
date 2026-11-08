"use client";

import { Chrome, Facebook } from "lucide-react";

export default function SocialAuthButtons() {
  return (
    <div className="space-y-3">
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
        <div className="relative flex justify-center"><span className="bg-white px-3 text-xs font-medium uppercase tracking-wide text-slate-400">Or continue with</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <a href="/api/auth/google" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
          <Chrome size={18} /> Google
        </a>
        <a href="/api/auth/facebook" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
          <Facebook size={18} /> Facebook
        </a>
      </div>
    </div>
  );
}
