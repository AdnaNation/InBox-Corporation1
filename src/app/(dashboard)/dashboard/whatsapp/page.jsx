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
    <div className="mx-auto max-w-3xl p-5 sm:p-8">
      <div className="mb-7">
        <h1 className="text-2xl font-bold">WhatsApp connection</h1>
        <p className="mt-1 text-sm text-slate-500">Manage the WhatsApp Business numbers connected to this workspace.</p>
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
              {health.webhookSubscription && (
                <div className={`mt-4 rounded-xl border p-4 text-sm ${
                  health.webhookSubscription.status === "subscribed"
                    ? "border-green-200 bg-green-50 text-green-900"
                    : health.webhookSubscription.status === "not_subscribed"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                }`}>
                  <div className="flex items-center gap-2 font-semibold">
                    {health.webhookSubscription.status === "subscribed"
                      ? <CheckCircle2 size={17} />
                      : <AlertTriangle size={17} />}
                    Incoming message webhook
                    <span className="ml-auto text-xs font-semibold uppercase">{health.webhookSubscription.status.replaceAll("_", " ")}</span>
                  </div>
                  <p className="mt-2">{health.webhookSubscription.message}</p>
                  {health.webhookSubscription.appName && (
                    <p className="mt-1 text-xs">Subscribed app: {health.webhookSubscription.appName}</p>
                  )}
                  <p className="mt-2 text-xs opacity-80">
                    This checks the app subscription on Meta for this WABA. It does not verify the global webhook callback URL or the Meta app's individual webhook field configuration.
                  </p>
                </div>
              )}
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
                    <p className="mt-2">Update the access token using the customer-owned Meta App credentials below before messaging is interrupted.</p>
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
            Scheduled checks are performed by the separately deployed Wavo background worker. The default interval is every 15 minutes. If the worker is not deployed and running, scheduled checks and email alerts will not be delivered.
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
            Paste a replacement access token issued by this connection's customer-owned Meta App, with both WhatsApp permissions. Wavo verifies the token against the App ID and App Secret saved for this WhatsApp account and checks the connected Phone Number ID before saving. Your current token stays active if verification fails.
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

      <section className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
        <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={18} /> Manual connection using your own Meta App</div>
        <p className="mt-2">Each business connects with its own Meta App credentials. Wavo encrypts the App Secret, webhook verify token, and WhatsApp access token separately for each workspace.</p>
        <p className="mt-2 font-semibold">Webhook callback URL</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-white px-2 py-1 text-xs">{webhookUrl || "Loading callback URL..."}</code>
          <button type="button" onClick={() => webhookUrl && navigator.clipboard.writeText(webhookUrl)} className="rounded border border-blue-300 bg-white px-3 py-1 text-xs font-semibold">Copy URL</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-semibold">Webhook verify token:</span><code className="rounded bg-white px-2 py-1 text-xs">{form.webhookVerifyToken || "Enter the token below"}</code><button type="button" disabled={!form.webhookVerifyToken} onClick={() => navigator.clipboard.writeText(form.webhookVerifyToken)} className="rounded border border-blue-300 bg-white px-3 py-1 text-xs font-semibold disabled:opacity-50">Copy token</button></div>
        <p className="mt-2">In your Meta App, make sure the WhatsApp product has the <code>messages</code> webhook field subscribed. Wavo applies a phone-number-level callback override for this number; your Meta App's default callback URL is not changed. While connected, this number's message events go to Wavo instead of the default callback. Disconnecting removes the override and restores the previous routing.</p>
      </section>

      <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-green-50 p-3 text-green-700"><Plug /></span>
          <div>
            <h2 className="font-semibold">Connect a WhatsApp Business Account</h2>
            <p className="text-xs text-slate-500">Enter credentials from the same customer-owned Meta App. Secrets are encrypted before storage and never returned by the API.</p>
          </div>
        </div>

        {[
          ["metaAppId", "Meta App ID"],
          ["metaAppSecret", "Meta App Secret"],
          ["webhookVerifyToken", "Webhook verify token (create your own, at least 8 characters)"],
          ["webhookCallbackUrl", "Public HTTPS webhook callback URL (use a public dev tunnel for local testing)"],
          ["wabaId", "WhatsApp Business Account ID"],
          ["phoneNumberId", "Phone Number ID"],
          ["businessName", "Business name (optional)"],
          ["displayPhoneNumber", "Display phone number (optional)"],
          ["accessToken", "WhatsApp access token / System User token"],
        ].map(([key, label]) => (
          <label key={key} className="mb-4 block text-sm font-medium">
            {label}
            <input
              required={!["businessName", "displayPhoneNumber"].includes(key)}
              type={["metaAppSecret", "accessToken"].includes(key) ? "password" : "text"}
              autoComplete="off"
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-green-500"
            />
          </label>
        ))}

        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50">
          {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Verify credentials and connect
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
