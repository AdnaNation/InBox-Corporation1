"use client";

import { useEffect, useState } from "react";
import { Facebook, CheckCircle2, Loader2 } from "lucide-react";

const messages = {
  connected: { text: "Facebook is now linked to your Wavo account.", error: false },
  "already-linked": { text: "That Facebook account is already linked to a different Wavo account.", error: true },
  cancelled: { text: "Facebook connection was cancelled.", error: true },
  invalid: { text: "The Facebook connection could not be verified. Please try again.", error: true },
  failed: { text: "Facebook could not be connected. Please try again.", error: true },
  "not-configured": { text: "Facebook Login is not configured on the server yet.", error: true },
};

export default function FacebookAccountConnection({ connected, email }) {
  const [notice, setNotice] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("facebookLink");
    if (status && messages[status]) {
      setNotice(messages[status]);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Facebook size={20} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Connected sign-in methods</h2>
          <p className="mt-1 text-sm text-slate-500">Link Facebook to this signed-in Wavo account. Your existing account and workspace will be kept.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">Facebook</p>
          <p className="mt-1 text-xs text-slate-500">{connected ? (email || "Facebook account linked") : "Not connected"}</p>
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Connected</span>
        ) : (
          <a
            href="/api/auth/facebook/link"
            onClick={() => setStarting(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {starting ? <Loader2 size={15} className="animate-spin" /> : <Facebook size={15} />}
            Connect Facebook
          </a>
        )}
      </div>
      {notice && (
        <p role={notice.error ? "alert" : "status"} className={`mt-4 rounded-lg p-3 text-sm ${notice.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </p>
      )}
    </section>
  );
}
