"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Loader2, AlertTriangle, Unplug, RefreshCw } from "lucide-react";
import WhatsAppEmbeddedSignup from "@/components/whatsapp-embedded-signup";

const emptyForm = {
  phoneNumberId: "",
  wabaId: "",
  displayPhoneNumber: "",
  businessName: "",
  accessToken: "",
};

export default function WhatsAppPage() {
  const [form, setForm] = useState(emptyForm);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  async function loadAccount() {
    setLoadingAccount(true);
    try {
      const response = await fetch("/api/whatsapp/account", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load account.");
      setAccount(data.account || null);
    } catch (error) {
      setMessage(error.message || "Could not load WhatsApp account.");
      setMessageError(true);
    } finally {
      setLoadingAccount(false);
    }
  }

  useEffect(() => {
    loadAccount();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setMessageError(false);
    try {
      const response = await fetch("/api/whatsapp/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not save account.");
      setMessage(data.message || "WhatsApp account saved.");
      setForm(emptyForm);
      await loadAccount();
    } catch (error) {
      setMessage(error.message || "Network error.");
      setMessageError(true);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this WhatsApp number from your workspace? Active campaigns must be paused or completed first.")) return;
    setDisconnecting(true);
    setMessage("");
    setMessageError(false);
    try {
      const response = await fetch("/api/whatsapp/account", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not disconnect WhatsApp.");
      setMessage(data.message || "WhatsApp disconnected.");
      setAccount(null);
    } catch (error) {
      setMessage(error.message || "Could not disconnect WhatsApp.");
      setMessageError(true);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold">WhatsApp connection</h1>
        <p className="mt-1 text-sm text-slate-500">Manage the WhatsApp Business Platform number connected to this workspace.</p>
      </div>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Connected account</h2>
            <p className="mt-1 text-xs text-slate-500">Connection status and business number.</p>
          </div>
          <button type="button" onClick={loadAccount} disabled={loadingAccount} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={15} className={loadingAccount ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {loadingAccount ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading account...</div>
        ) : account ? (
          <div className="mt-5 rounded-xl border border-green-200 bg-green-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-green-900">{account.businessName}</p>
                <p className="mt-1 text-sm text-green-800">{account.displayPhoneNumber}</p>
                <p className="mt-1 text-xs text-green-700">Phone Number ID: {account.phoneNumberId}</p>
              </div>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Connected</span>
            </div>
            <button type="button" onClick={disconnect} disabled={disconnecting} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              {disconnecting ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />}
              Disconnect number
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No WhatsApp number is currently connected.</div>
        )}
      </section>

      {!loadingAccount && <WhatsAppEmbeddedSignup connected={Boolean(account)} onConnected={loadAccount} />}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} />Developer setup required</div>
        <p className="mt-1">Meta Embedded Signup is available above once your v4 configuration is added. Manual credentials remain as a developer fallback; coexistence onboarding and automated token-expiry handling are not included yet.</p>
      </div>

      <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-green-50 p-3 text-green-700"><Plug /></span>
          <div>
            <h2 className="font-semibold">{account ? "Replace connected number" : "Connect a WhatsApp number"}</h2>
            <p className="text-xs text-slate-500">Credentials are encrypted before being stored.</p>
          </div>
        </div>

        {[
          ["businessName", "Business name"],
          ["wabaId", "WhatsApp Business Account ID"],
          ["phoneNumberId", "Phone Number ID"],
          ["displayPhoneNumber", "Display phone number"],
          ["accessToken", "Permanent/system-user access token"],
        ].map(([key, label]) => (
          <label key={key} className="mb-4 block text-sm font-medium">
            {label}
            <input
              required
              type={key === "accessToken" ? "password" : "text"}
              autoComplete="off"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
          </label>
        ))}

        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck size={18} />}
          {account ? "Save replacement number" : "Save WhatsApp account"}
        </button>
      </form>

      {message && (
        <p role="status" className={`mt-4 rounded-lg p-3 text-sm ${messageError ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-700"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
