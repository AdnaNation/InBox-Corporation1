"use client";

import { useEffect, useState } from "react";

const plans = [
  { id: "starter", name: "Starter", description: "For small teams getting started with WhatsApp customer communication.", features: ["Shared team workspace", "Contact and campaign tools", "Usage overview"] },
  { id: "growth", name: "Growth", description: "For growing teams managing more customer conversations and campaigns.", features: ["Everything in Starter", "Higher usage capacity", "Growing team workflows"] },
  { id: "business", name: "Business", description: "For businesses with larger teams and operational needs.", features: ["Everything in Growth", "Business-level capacity", "Priority plan discussion"] },
];

const number = (value) => new Intl.NumberFormat().format(value || 0);

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusStyle(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  if (status === "pending") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function formatPlanPrice(minor, currency, cycle) {
  if (minor == null) return "Contact sales";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100) + " / " + (cycle === "yearly" ? "year" : "month");
}

export default function BillingClient() {
  const [data, setData] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState("");
  const [notice, setNotice] = useState("");
  const [metaUsage, setMetaUsage] = useState(null);
  const [metaUsageLoading, setMetaUsageLoading] = useState(true);
  const [metaUsageError, setMetaUsageError] = useState("");

  async function loadBilling() {
    setLoading(true);
    try {
      const response = await fetch("/api/billing", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to load billing.");
      setData(result);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMetaUsage() {
    setMetaUsageLoading(true);
    setMetaUsageError("");
    try {
      const response = await fetch("/api/billing/meta-usage", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Could not load Meta usage.");
      setMetaUsage(result);
    } catch (error) {
      setMetaUsageError(error.message || "Meta usage is temporarily unavailable.");
    } finally {
      setMetaUsageLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();
    loadMetaUsage();
  }, []);

  async function requestPlan(plan) {
    setRequesting(plan);
    setNotice("");
    try {
      const response = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingCycle: cycle }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Could not submit request.");
      setNotice(result.message);
      await loadBilling();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setRequesting("");
    }
  }

  const currentPlan = data?.plan || "free";
  const requestHistory = Array.isArray(data?.requestHistory) ? data.requestHistory : [];
  const pricing = data?.planPricing || { currency: "BDT", plans: {} };

  return (
    <div className="space-y-7">
      {notice && <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{notice}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Current plan</p>
            <h2 className="mt-1 text-3xl font-bold capitalize text-slate-900">{currentPlan}</h2>
            <p className="mt-2 text-sm text-slate-500">Subscription status: <span className="font-medium capitalize text-slate-700">{data?.subscriptionStatus || "—"}</span></p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{data?.pendingRequest ? "Request pending" : "Workspace plan"}</span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Usage label="Contacts" value={data?.usage?.contacts} limit={data?.limits?.contacts} />
          <Usage label="Messages this month" value={data?.usage?.messagesThisMonth} limit={data?.limits?.messagesThisMonth} />
          <Usage label="Campaigns this month" value={data?.usage?.campaignsThisMonth} limit={data?.limits?.campaignsThisMonth} />
        </div>
        {data?.pendingRequest && <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">You have a pending request for the {data.pendingRequest.plan} plan ({data.pendingRequest.billingCycle}). Our team will contact you.</p>}
        {loading && <p className="mt-4 text-sm text-slate-500">Loading usage…</p>}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Choose a plan</h2>
            <p className="mt-1 text-sm text-slate-500">Request an upgrade. Prices are published by InBox Corporation; activation is reviewed manually.</p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {["monthly", "yearly"].map((value) => <button key={value} type="button" onClick={() => setCycle(value)} className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${cycle === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{value}</button>)}
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const price = pricing.plans?.[plan.id]?.[cycle + "Minor"];
            return <article key={plan.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${isCurrent ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                {isCurrent && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Current plan</span>}
              </div>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p>
              <p className="mt-4 text-2xl font-bold text-slate-950">{formatPlanPrice(price, pricing.currency || "BDT", cycle)}</p>
              <ul className="mt-5 flex-1 space-y-3 text-sm text-slate-700">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2"><span className="text-emerald-600">✓</span>{feature}</li>)}
              </ul>
              <button type="button" disabled={loading || !!data?.pendingRequest || isCurrent || !!requesting} onClick={() => requestPlan(plan.id)} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {requesting === plan.id ? "Submitting…" : isCurrent ? "Current plan" : data?.pendingRequest ? "Request pending" : "Request this plan"}
              </button>
            </article>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Plan request history</h2>
            <p className="mt-1 text-sm text-slate-500">Review the latest upgrade requests submitted by this workspace.</p>
          </div>
          <span className="text-xs text-slate-500">Latest {requestHistory.length} requests</span>
        </div>
        {loading && !data ? (
          <p className="mt-5 text-sm text-slate-500">Loading request history…</p>
        ) : requestHistory.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Plan</th>
                  <th className="px-3 py-3 font-semibold">Billing cycle</th>
                  <th className="px-3 py-3 font-semibold">Submitted</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Reviewed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requestHistory.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-4 font-semibold capitalize text-slate-900">{item.plan || "—"}</td>
                    <td className="px-3 py-4 capitalize text-slate-600">{item.billingCycle || "—"}</td>
                    <td className="px-3 py-4 text-slate-600">{formatDate(item.createdAt)}</td>
                    <td className="px-3 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle(item.status)}`}>{item.status || "unknown"}</span></td>
                    <td className="px-3 py-4 text-slate-600">{formatDate(item.reviewedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No plan requests have been submitted yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Meta WhatsApp usage</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Message charges this month</h2>
            <p className="mt-1 text-sm text-slate-500">Usage and approximate cost reported directly by Meta for your connected WhatsApp Business Account(s).</p>
          </div>
          <button type="button" onClick={loadMetaUsage} disabled={metaUsageLoading} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {metaUsageLoading ? "Refreshing…" : "Refresh usage"}
          </button>
        </div>
        {metaUsageError ? (
          <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{metaUsageError}</p>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Meta-reported estimated charges</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">
                  {metaUsageLoading && !metaUsage ? "Loading…" : metaUsage?.costAvailable === false ? "Unavailable" : formatMetaMoney(metaUsage?.currentMonth?.cost || 0, metaUsage?.currency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">{metaUsage?.currency || "Meta account currency"} · {metaUsage?.currentMonth?.month || new Date().toISOString().slice(0, 7)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Delivered message volume</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">{number(metaUsage?.currentMonth?.volume || 0)}</p>
                <p className="mt-1 text-xs text-slate-500">Across connected WhatsApp numbers</p>
              </div>
            </div>
            {metaUsage?.message && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-800">{metaUsage.message}</p>}
            {metaUsage?.currencyMismatch && <p className="mt-3 text-sm text-amber-700">Wavo cannot safely combine these accounts because their billing currencies differ or could not all be confirmed. Review each account separately below.</p>}
            {metaUsage?.byCategory?.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-800">Cost by message category</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[360px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Delivered</th><th className="py-2 text-right">Reported cost</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {metaUsage.byCategory.map((item) => <tr key={item.category}><td className="py-3 pr-3 font-medium capitalize text-slate-800">{item.category.replaceAll("_", " ")}</td><td className="py-3 pr-3 text-slate-600">{number(item.volume)}</td><td className="py-3 text-right font-semibold tabular-nums text-slate-900">{formatMetaMoney(item.cost, metaUsage.currency)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {metaUsage?.byPhone?.length > 1 && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-800">Usage by WhatsApp number</h3>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[360px] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="py-2 pr-3">Phone number</th><th className="py-2 pr-3">Delivered</th><th className="py-2 text-right">Reported cost</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {metaUsage.byPhone.map((item) => <tr key={item.phoneNumber}><td className="py-3 pr-3 font-medium text-slate-800">{item.phoneNumber}</td><td className="py-3 pr-3 text-slate-600">{number(item.volume)}</td><td className="py-3 text-right font-semibold tabular-nums text-slate-900">{metaUsage.costAvailable ? formatMetaMoney(item.cost, metaUsage.currency) : "Unavailable"}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {metaUsage?.accounts?.length > 0 && (
              <div className="mt-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">WhatsApp account sync details</h3>
                {metaUsage.accounts.map((account, index) => <div key={account.wabaId || account.connectedPhoneNumbers?.[0] || index} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{account.businessName}</p><p className="mt-1 text-xs text-slate-500">{account.connectedPhoneNumbers?.join(", ") || account.wabaId || "Account details unavailable"}</p>{!account.success && <p className="mt-2 text-sm leading-5 text-amber-800">{account.message}</p>}{account.code && <p className="mt-1 text-xs text-slate-500">Meta error code: {account.code}{account.subcode ? ` · ${account.subcode}` : ""}</p>}</div>
                  <div className="text-right"><p className="font-semibold text-slate-900">{account.success ? (account.costAvailable ? formatMetaMoney(account.currentMonth.cost, account.currency) : "Cost unavailable") : "Sync unavailable"}</p><p className="mt-1 text-xs text-slate-500">{account.success ? number(account.currentMonth.volume) + " delivered" : account.httpStatus ? `HTTP ${account.httpStatus}` : "Needs attention"}</p></div>
                </div>)}
              </div>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">Last synced: {metaUsage?.fetchedAt ? formatDate(metaUsage.fetchedAt) : "—"}. Meta pricing analytics are approximate and may be delayed. This is not your final invoice or payment balance; check your Meta Business billing account for the official amount payable. If Meta does not expose cost data for an account (including some Solution Partner credit-line setups), Wavo will not estimate or invent it.</p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <h2 className="font-semibold text-blue-950">Meta charges are separate from your Wavo subscription</h2>
        <p className="mt-2 text-sm leading-6 text-blue-900">
          Meta bills your connected WhatsApp Business Account for eligible delivered messages. Wavo displays Meta's reported usage analytics; Meta continues to manage the actual invoice and payment. Open Meta Billing &amp; Payments to review your WhatsApp account balance, invoices, payment methods, and any available Pay now action. You may need a Business Portfolio admin or finance role.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="https://business.facebook.com/latest/billing_hub/payment_activity/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800">Open Meta Billing &amp; Payments <span aria-hidden="true" className="ml-2">↗</span></a>
          <a href="https://whatsappbusiness.com/products/platform-pricing/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-900 ring-1 ring-blue-200 transition hover:bg-blue-100">Official WhatsApp platform pricing <span aria-hidden="true" className="ml-2">↗</span></a>
          <a href="https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing" target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-900 ring-1 ring-blue-200 transition hover:bg-blue-100">Meta pricing documentation <span aria-hidden="true" className="ml-2">↗</span></a>
        </div>
      </section>
      <p className="text-xs leading-5 text-slate-500">Payments, invoices, and automatic renewals are not enabled yet. Submitting a request does not charge your account or change your plan. Usage shows your current totals against the included limits for your selected plan.</p>
    </div>
  );
}

function formatMetaMoney(value, currency) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "—";
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);
    } catch {}
  }
  return amount.toFixed(4);
}

function Usage({ label, value, limit }) {
  return <div className="rounded-xl bg-slate-50 p-4">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{number(value)}</p>
    {limit != null && <p className="mt-1 text-xs text-slate-500">of {number(limit)} included</p>}
  </div>;
}
