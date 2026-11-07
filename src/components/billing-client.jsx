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

export default function BillingClient() {
  const [data, setData] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState("");
  const [notice, setNotice] = useState("");

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

  useEffect(() => { loadBilling(); }, []);

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
            <p className="mt-1 text-sm text-slate-500">Request an upgrade. Our team will confirm pricing and activation.</p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {["monthly", "yearly"].map((value) => <button key={value} type="button" onClick={() => setCycle(value)} className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${cycle === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{value}</button>)}
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            return <article key={plan.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${isCurrent ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                {isCurrent && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Current plan</span>}
              </div>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p>
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

      <p className="text-xs leading-5 text-slate-500">Payments, invoices, and automatic renewals are not enabled yet. Submitting a request does not charge your account or change your plan. Usage shows your current totals against the included limits for your selected plan.</p>
    </div>
  );
}

function Usage({ label, value, limit }) {
  return <div className="rounded-xl bg-slate-50 p-4">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{number(value)}</p>
    {limit != null && <p className="mt-1 text-xs text-slate-500">of {number(limit)} included</p>}
  </div>;
}
