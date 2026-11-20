"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Loader2, AlertTriangle, Unplug, RefreshCw, Activity, CheckCircle2 } from "lucide-react";
import { showConfirm } from "@/lib/swal";

const emptyForm = {
  metaAppId: "",
  metaAppSecret: "",
  webhookVerifyToken: "",
  webhookCallbackUrl: "",
  phoneNumberId: "",
  wabaId: "",
  displayPhoneNumber: "",
  businessName: "",
  accessToken: "",
};

export default function WhatsAppPage() {
  const [form, setForm] = useState(emptyForm);
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [switchingAccount, setSwitchingAccount] = useState("");
  const [health, setHealth] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [replacementToken, setReplacementToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");

  async function loadAccount() {
    setLoadingAccount(true);
    try {
      const response = await fetch("/api/whatsapp/account", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load account.");
      setAccounts(data.accounts || (data.account ? [data.account] : []));
      setAccount(data.account || null);
      if (data.connected) await loadHealth(data.account?.phoneNumberId);
      else setHealth(null);
    } catch (error) {
      setMessage(error.message || "Could not load WhatsApp account.");
      setMessageError(true);
    } finally {
      setLoadingAccount(false);
    }
  }

  async function loadHealth(phoneNumberId = account?.phoneNumberId) {
    setLoadingHealth(true);
    try {
      const query = phoneNumberId ? `?phoneNumberId=${encodeURIComponent(phoneNumberId)}` : "";
      const response = await fetch(`/api/whatsapp/account/health${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not check account health.");
      setHealth(data.health || null);
    } catch (error) {
      setHealth({ connectionStatus: "attention", message: error.message || "Could not check account health." });
    } finally {
      setLoadingHealth(false);
    }
  }

  useEffect(() => {
    const callback = `${window.location.origin}/api/whatsapp/webhook`;
    setWebhookUrl(callback);
    setForm((previous) => ({ ...previous, webhookCallbackUrl: callback }));
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
      setForm({ ...emptyForm, metaAppId: form.metaAppId, webhookVerifyToken: form.webhookVerifyToken, webhookCallbackUrl: form.webhookCallbackUrl, wabaId: form.wabaId, phoneNumberId: form.phoneNumberId });
      await loadAccount();
    } catch (error) {
      setMessage(error.message || "Network error.");
      setMessageError(true);
    } finally {
      setLoading(false);
    }
  }

  async function updateAccessToken(e) {
    e.preventDefault();
    if (!replacementToken.trim()) return;
    setSavingToken(true);
    setMessage("");
    setMessageError(false);
    try {
      const response = await fetch("/api/whatsapp/account/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: replacementToken.trim(), phoneNumberId: account?.phoneNumberId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update access token.");
      setReplacementToken("");
      setMessage(data.message || "Access token updated and verified with Meta.");
      await loadHealth();
    } catch (error) {
      setMessage(error.message || "Could not update access token.");
      setMessageError(true);
    } finally {
      setSavingToken(false);
    }
  }

  async function activateAccount(phoneNumberId) {
    if (!phoneNumberId || phoneNumberId === account?.phoneNumberId) return;
    setSwitchingAccount(phoneNumberId);
    setMessage("");
    setMessageError(false);
    try {
      const response = await fetch("/api/whatsapp/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not switch WhatsApp number.");
      setMessage(data.message || "Active WhatsApp number switched.");
      await loadAccount();
    } catch (error) {
      setMessage(error.message || "Could not switch WhatsApp number.");
      setMessageError(true);
    } finally {
      setSwitchingAccount("");
    }
  }

  async function disconnect() {
    if (!(await showConfirm({ title: "Disconnect WhatsApp number?", text: "Active campaigns must be paused or completed first.", confirmButtonText: "Disconnect number" }))) return;
    setDisconnecting(true);
    setMessage("");
    setMessageError(false);
    try {
      const response = await fetch("/api/whatsapp/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId: account?.phoneNumberId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not disconnect WhatsApp.");
      setMessage(data.message || "WhatsApp disconnected.");
      await loadAccount();
    } catch (error) {
      setMessage(error.message || "Could not disconnect WhatsApp.");
      setMessageError(true);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1180px] space-y-6 px-4 py-7 sm:px-7 sm:py-9">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-emerald-700">Channels</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-.045em] text-slate-950">WhatsApp</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Connect and monitor the WhatsApp Business numbers your team uses to talk with customers.</p></div>
        <button type="button" onClick={loadAccount} disabled={loadingAccount} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={loadingAccount ? "animate-spin" : ""}/> Refresh status</button>
      </header>

      {message && <p role="status" className={"rounded-lg border px-4 py-3 text-sm " + (messageError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900")}>{message}</p>}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf5ef] text-emerald-800"><Plug size={19}/></span><div><h2 className="text-sm font-semibold text-slate-900">Active number</h2><p className="mt-0.5 text-xs text-slate-500">The number used for outgoing messages.</p></div></div>
          {loadingAccount ? <div className="mt-7 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/>Loading connected numbers…</div> : account ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-lg font-semibold tracking-tight text-slate-950">{account.businessName || "WhatsApp Business"}</p><p className="mt-1 text-sm text-slate-600">{account.displayPhoneNumber}</p><p className="mt-2 font-mono text-[10px] text-slate-400">Phone Number ID · {account.phoneNumberId}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600"/>Connected</span></div>
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={loadHealth} disabled={loadingHealth} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#087f5b] px-3 text-xs font-semibold text-white transition hover:bg-[#066447] disabled:opacity-50"><RefreshCw size={14} className={loadingHealth ? "animate-spin" : ""}/> Check connection health</button><button type="button" onClick={disconnect} disabled={disconnecting} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50>{disconnecting ? <Loader2 size={14} className="animate-spin"/> : <Unplug size={14}/>}Disconnect number</button></div>
            </div>
          ) : <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-7 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm"><Plug size={18}/></span><p className="mt-3 text-sm font-semibold text-slate-800">No number connected</p><p className="mt-1 text-xs text-slate-500">Connect a WhatsApp Business Account to start receiving and sending messages.</p></div>}
          {accounts.length > 1 && <div className="mt-6 border-t border-slate-100 pt-4"><h3 className="mb-3 text-xs font-semibold text-slate-700">Other connected numbers</h3><div className="space-y-2">{accounts.filter((item) => item.phoneNumberId !== account?.phoneNumberId).map((item) => <div key={item.phoneNumberId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{item.businessName || "WhatsApp Business"}</p><p className="mt-1 text-xs text-slate-500">{item.displayPhoneNumber}</p></div><button type="button" onClick={() => activateAccount(item.phoneNumberId)} disabled={Boolean(switchingAccount)} className="h-8 rounded-md border border-emerald-200 px-3 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">{switchingAccount === item.phoneNumberId ? "Switching…" : "Make active"}</button></div>)}</div></div>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Activity size={19}/></span><div><h2 className="text-sm font-semibold text-slate-900">Connection health</h2><p className="mt-0.5 text-xs text-slate-500">Live checks from Meta Graph API.</p></div></div>
          {!account ? <p className="mt-6 text-xs leading-5 text-slate-500">Connect a number to see token, webhook and phone quality information.</p> : loadingHealth && !health ? <p className="mt-6 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin"/>Checking Meta connection…</p> : health ? (
            <div className="mt-5 space-y-3">
              <div className={"rounded-lg p-3 " + (health.connectionStatus === "healthy" ? "bg-emerald-50" : "bg-amber-50")}><div className={"flex items-center gap-2 text-xs font-semibold " + (health.connectionStatus === "healthy" ? "text-emerald-800" : "text-amber-900")}>{health.connectionStatus === "healthy" ? <CheckCircle2 size={15}/> : <AlertTriangle size={15}/ >}{health.connectionStatus === "healthy" ? "Connection healthy" : "Attention required"}</div><p className="mt-1 text-xs leading-5 text-slate-600">{health.message || "Meta account check completed."}</p></div>
              {health.webhookSubscription && <div className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-800">Incoming message webhook</span><span className="text-[10px] font-semibold uppercase text-slate-500">{health.webhookSubscription.status.replaceAll("_"," ")}</span></div><p className="mt-1.5 text-xs leading-5 text-slate-500">{health.webhookSubscription.message}</p>{health.webhookSubscription.appName && <p className="mt-1 text-[10px] text-slate-400">Subscribed app: {health.webhookSubscription.appName}</p>}</div>}
              {health.tokenExpiryStatus && <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-800">Access token expiry</p><p className="mt-1 text-xs leading-5 text-slate-500">{health.tokenExpiryStatus === "unknown" ? "Meta did not provide an expiry date for this token." : health.tokenExpiresAt ? `${health.tokenExpiryStatus === "expired" ? "Expired" : health.tokenExpiryStatus === "expiring" ? "Expires soon" : "Expires"}: ${new Date(health.tokenExpiresAt).toLocaleString()}` : "Expiry information is unavailable."}</p>{health.dataAccessExpiresAt && <p className="mt-1 text-[10px] text-slate-400">Meta data access expiry: {new Date(health.dataAccessExpiresAt).toLocaleString()}</p>}</div>}
              {health.tokenStatus === "valid" && <div className="grid grid-cols-2 gap-2">{[{label:"Access token",value:"Accepted by Meta"},{label:"Phone quality",value:health.qualityRating || "Unknown"},{label:"Verified name",value:health.verifiedName || "Not provided"},{label:"Number verification",value:health.codeVerificationStatus || "Unknown"}].map((item)=><div key={item.label} className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-500">{item.label}</p><p className="mt-1 text-xs font-semibold text-slate-800">{item.value}</p></div>)}</div>}
            </div>
          ) : <p className="mt-6 text-xs leading-5 text-slate-500">Health information is not available yet. Run a connection check.</p>}
        </div>
      </section>

      {account && <details className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden"><span><span className="block text-sm font-semibold text-slate-900">Monitoring and token management</span><span className="mt-1 block text-xs text-slate-500">Scheduled checks, email alerts and credential rotation.</span></span><span className="text-xs font-semibold text-emerald-800 group-open:hidden">View settings</span><span className="hidden text-xs font-semibold text-emerald-800 group-open:inline">Hide settings</span></summary>
        <div className="grid gap-4 border-t border-slate-100 p-5 lg:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-4"><div className="flex items-center gap-2"><Activity size={15} className="text-slate-500"/><h3 className="text-xs font-semibold text-slate-800">Automated health monitoring</h3></div><div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-slate-500">Latest scheduled check</span><span className="rounded bg-white px-2 py-1 text-[10px] font-semibold capitalize text-slate-700">{health?.lastAutomatedStatus?.replaceAll("_"," ") || "Not checked yet"}</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{health?.lastAutomatedMessage || "Scheduled monitoring has not run yet."}</p><p className="mt-2 text-[10px] text-slate-400">{health?.lastAutomatedCheckAt ? `Last checked: ${new Date(health.lastAutomatedCheckAt).toLocaleString()}` : "No scheduled check has been recorded."}</p><p className="mt-3 text-[10px] leading-5 text-slate-500">The background worker performs scheduled checks every 15 minutes by default. Email alerts require RESEND_API_KEY and EMAIL_FROM in the deployment environment.</p></div>
          <form onSubmit={updateAccessToken} className="rounded-lg border border-slate-200 p-4"><div className="flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-700"/><h3 className="text-xs font-semibold text-slate-800">Update access token</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">A replacement token is verified against this connection's saved Meta App credentials and Phone Number ID. The current token remains active if verification fails.</p><label className="mt-4 block text-xs font-medium text-slate-700">New Meta access token<input required type="password" autoComplete="new-password" value={replacementToken} onChange={(e)=>setReplacementToken(e.target.value)} placeholder="Paste replacement token" className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-emerald-700"/></label><button disabled={savingToken || !replacementToken.trim()} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#087f5b] text-xs font-semibold text-white hover:bg-[#066447] disabled:opacity-50">{savingToken ? <Loader2 size={14} className="animate-spin"/> : <ShieldCheck size={14}/>}Verify and update token</button></form>
        </div>
      </details>}

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden"><span><span className="block text-sm font-semibold text-slate-900">Webhook setup</span><span className="mt-1 block text-xs text-slate-500">Callback URL, verification token and Meta subscription instructions.</span></span><span className="text-xs font-semibold text-emerald-800">Setup guide</span></summary>
        <div className="border-t border-slate-100 p-5 text-xs leading-6 text-slate-600">
          <p>Each business connects using its own Meta App credentials. Wavo encrypts the App Secret, webhook verify token and WhatsApp access token separately for each workspace.</p>
          <p className="mt-4 font-semibold text-slate-800">Webhook callback URL</p><div className="mt-1 flex flex-wrap items-center gap-2"><code className="min-w-0 break-all rounded-md bg-slate-50 px-3 py-2 text-[11px]">{webhookUrl || "Loading callback URL…"}</code><button type="button" onClick={() => webhookUrl && navigator.clipboard.writeText(webhookUrl)} className="h-8 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">Copy URL</button></div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-800">Webhook verify token:</span><code className="rounded-md bg-slate-50 px-2 py-1 text-[11px]">{form.webhookVerifyToken || "Enter a token below"}</code><button type="button" disabled={!form.webhookVerifyToken} onClick={() => navigator.clipboard.writeText(form.webhookVerifyToken)} className="h-7 rounded-md border border-slate-200 px-2 text-[10px] font-semibold disabled:opacity-40">Copy token</button></div>
          <p className="mt-3">Subscribe to the <code>messages</code> webhook field in your Meta App. Wavo applies a phone-number-level callback override while connected; disconnecting removes that override and restores the previous routing.</p>
        </div>
      </details>

      <details open={!account} className="group rounded-xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden"><span><span className="block text-sm font-semibold text-slate-900">{account ? "Connect another WhatsApp number" : "Connect your WhatsApp Business Account"}</span><span className="mt-1 block text-xs text-slate-500">Use credentials from the same customer-owned Meta App.</span></span><span className="text-xs font-semibold text-emerald-800 group-open:hidden">Add number</span><span className="hidden text-xs font-semibold text-emerald-800 group-open:inline">Hide form</span></summary>
        <form onSubmit={submit} className="border-t border-slate-100 p-5">
          <div className="mb-5 rounded-lg bg-[#f5f8f5] p-3 text-xs leading-5 text-slate-600">Your Meta App Secret, webhook verify token and access token are encrypted separately before storage. They are never returned by the API.</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["metaAppId", "Meta App ID", "text"],
              ["metaAppSecret", "Meta App Secret", "password"],
              ["webhookVerifyToken", "Webhook verify token", "text"],
              ["webhookCallbackUrl", "Webhook callback URL", "url"],
              ["wabaId", "WhatsApp Business Account ID", "text"],
              ["phoneNumberId", "Phone Number ID", "text"],
              ["businessName", "Business name (optional)", "text"],
              ["displayPhoneNumber", "Display phone number (optional)", "text"],
              ["accessToken", "WhatsApp access token", "password"],
            ].map(([key, label, type]) => <label key={key} className="block min-w-0 text-xs font-semibold text-slate-700">{label}<input required={!["businessName","displayPhoneNumber"].includes(key)} type={type} autoComplete="off" value={form[key]} onChange={(e)=>setForm({...form,[key]:e.target.value})} placeholder={key === "webhookCallbackUrl" ? "https://your-domain.com/api/whatsapp/webhook" : key === "webhookVerifyToken" ? "Create a private token (8+ characters)" : `Enter ${label.toLowerCase()}`} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700"/></label>)}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="max-w-xl text-[10px] leading-5 text-slate-400">Make sure your Meta App is configured for WhatsApp Cloud API and the callback URL is publicly reachable over HTTPS.</p><button disabled={loading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#087f5b] px-4 text-xs font-semibold text-white transition hover:bg-[#066447] disabled:opacity-50">{loading ? <Loader2 size={15} className="animate-spin"/> : <ShieldCheck size={15}/>}Verify credentials and connect</button></div>
        </form>
      </details>
    </main>
  );
}
