"use client";

import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Loader2, AlertTriangle, Unplug, RefreshCw, Activity, CheckCircle2 } from "lucide-react";
import WhatsAppEmbeddedSignup from "@/components/whatsapp-embedded-signup";
import { showConfirm } from "@/lib/swal";

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
        body: JSON.stringify({ accessToken: replacementToken.trim() }),
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
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold">WhatsApp connection</h1>
        <p className="mt-1 text-sm text-slate-500">Manage the WhatsApp Business Platform number connected to this workspace.</p>
      </div>

      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Active WhatsApp account</h2>
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

        {accounts.length > 1 && (
          <div className="mt-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Other connected numbers</h3>
            {accounts.filter((item) => item.phoneNumberId !== account?.phoneNumberId).map((item) => (
              <div key={item.phoneNumberId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold text-slate-800">{item.businessName}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.displayPhoneNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">Phone Number ID: {item.phoneNumberId}</p>
                </div>
                <button type="button" onClick={() => activateAccount(item.phoneNumberId)} disabled={Boolean(switchingAccount)} className="rounded-lg border border-green-200 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
                  {switchingAccount === item.phoneNumberId ? "Switching..." : "Make active"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {account && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-slate-100 p-3 text-slate-700"><Activity size={20} /></span>
              <div><h2 className="font-semibold">Account health</h2><p className="mt-1 text-xs text-slate-500">Live check against Meta Graph API.</p></div>
            </div>
            <button type="button" onClick={loadHealth} disabled={loadingHealth} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={15} className={loadingHealth ? "animate-spin" : ""} /> Check now
            </button>
          </div>
          {loadingHealth && !health ? <p className="mt-5 text-sm text-slate-500">Checking token and number status...</p> : health ? (
            <div className="mt-5">
              <div className={`flex items-start gap-2 rounded-xl p-4 text-sm ${health.connectionStatus === "healthy" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
                {health.connectionStatus === "healthy" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <div><p className="font-semibold">{health.connectionStatus === "healthy" ? "Connection healthy" : "Attention required"}</p><p className="mt-1">{health.message || "Meta account check completed."}</p></div>
              </div>
              {health.tokenExpiryStatus && (
                <div className={`mt-4 rounded-xl border p-4 text-sm ${
                  health.tokenExpiryStatus === "expired" || health.tokenExpiryStatus === "expiring"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}>
                  <p className="font-semibold">Access token expiry</p>
                  <p className="mt-1">
                    {health.tokenExpiryStatus === "unknown"
                      ? "Meta did not provide an expiry date for this token."
                      : health.tokenExpiresAt
                        ? `${health.tokenExpiryStatus === "expired" ? "Expired" : health.tokenExpiryStatus === "expiring" ? "Expires soon" : "Expires"}: ${new Date(health.tokenExpiresAt).toLocaleString()}`
                        : "Expiry information is unavailable."}
                  </p>
                  {health.dataAccessExpiresAt && (
                    <p className="mt-1 text-xs">Meta data access expiry: {new Date(health.dataAccessExpiresAt).toLocaleString()}</p>
                  )}
                  {(health.tokenExpiryStatus === "expired" || health.tokenExpiryStatus === "expiring") && (
                    <p className="mt-2">Reconnect using the Meta button below before messaging is interrupted.</p>
                  )}
                </div>
              )}
              {health.tokenStatus === "valid" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Access token</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-green-700"><CheckCircle2 size={15} /> Accepted by Meta</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Phone number quality</p><p className="mt-1 text-sm font-semibold text-slate-800">{health.qualityRating || "Unknown"}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Verified business name</p><p className="mt-1 text-sm font-semibold text-slate-800">{health.verifiedName || "Not provided by Meta"}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Number verification</p><p className="mt-1 text-sm font-semibold text-slate-800">{health.codeVerificationStatus || "Unknown"}</p></div>
                </div>
              )}
            </div>
          ) : <p className="mt-5 text-sm text-slate-500">Health information is not available yet. Select Check now.</p>}
        </section>
      )}

      {account && (
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Activity size={20} /></span>
            <div>
              <h2 className="font-semibold">Automated health monitoring</h2>
              <p className="mt-1 text-xs text-slate-500">Scheduled checks record connection changes and recovery events.</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500">Latest scheduled check</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                health?.lastAutomatedStatus === "healthy" ? "bg-green-100 text-green-800" :
                health?.lastAutomatedStatus === "attention" ? "bg-amber-100 text-amber-900" :
                health?.lastAutomatedStatus === "unavailable" ? "bg-slate-200 text-slate-700" :
                "bg-slate-200 text-slate-700"
              }`}>
                {health?.lastAutomatedStatus === "not_checked" || !health?.lastAutomatedStatus
                  ? "Not checked yet"
                  : health.lastAutomatedStatus.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-2 text-slate-700">{health?.lastAutomatedMessage || "Scheduled monitoring has not run yet."}</p>
            <p className="mt-2 text-xs text-slate-500">
              {health?.lastAutomatedCheckAt
                ? `Last checked: ${new Date(health.lastAutomatedCheckAt).toLocaleString()}`
                : "No scheduled check has been recorded."}
            </p>
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Email alerts</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              When the connection changes to attention or unavailable, and when it recovers, InBox Corporation emails the workspace owner at their account email address.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Email delivery requires <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> in your Vercel project environment variables. The sender address must be verified in Resend. Until these are configured, alert events stay queued and will be sent by the next scheduled check after configuration.
            </p>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Automatic checks run every 5 minutes using your existing cron job and its Authorization Bearer secret. No additional cron job is needed.
          </p>
        </section>
      )}

      {account && (
        <form onSubmit={updateAccessToken} className="mb-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-xl bg-green-50 p-3 text-green-700"><ShieldCheck size={20} /></span>
            <div>
              <h2 className="font-semibold">Update access token</h2>
              <p className="text-xs text-slate-500">Keep the same WhatsApp number and business account.</p>
            </div>
          </div>
          <p className="mb-4 text-sm leading-6 text-slate-600">
            Paste a replacement Meta access token. InBox Corporation will verify it against your connected Phone Number ID before saving it. Your current token stays active if verification fails.
          </p>
          <label className="block text-sm font-medium">
            New Meta access token
            <input
              required
              type="password"
              autoComplete="new-password"
              value={replacementToken}
              onChange={(e) => setReplacementToken(e.target.value)}
              placeholder="Paste the new access token"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
          </label>
          <button disabled={savingToken || !replacementToken.trim()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50">
            {savingToken ? <Loader2 className="animate-spin" /> : <ShieldCheck size={18} />}
            Verify and update token
          </button>
        </form>
      )}

      {!loadingAccount && <WhatsAppEmbeddedSignup connected={Boolean(account)} onConnected={loadAccount} />}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} />Developer setup required</div>
        <p className="mt-1">Meta Embedded Signup is available above once your v4 configuration is added. Token expiry is monitored when Meta provides an expiry timestamp; reconnect through Meta when the dashboard shows an expiry warning. Manual credentials remain as a developer fallback.</p>
      </div>

      <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-green-50 p-3 text-green-700"><Plug /></span>
          <div>
            <h2 className="font-semibold">Add another WhatsApp number</h2>
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
          Add WhatsApp number
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
