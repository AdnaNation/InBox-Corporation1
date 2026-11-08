"use client";

import { useEffect, useState } from "react";

const plans = [
  { id: "starter", name: "Starter", description: "For small teams getting started with WhatsApp customer communication.", features: ["Shared team workspace", "Contact and campaign tools", "Usage overview"] },
  { id: "growth", name: "Growth", description: "For growing teams managing more customer conversations and campaigns.", features: ["Everything in Starter", "Higher usage capacity", "Growing team workflows"] },
  { id: "business", name: "Business", description: "For businesses with larger teams and operational needs.", features: ["Everything in Growth", "Business-level capacity", "Priority plan discussion"] },
];

let paddleScriptPromise = null;
let paddleInitializedToken = null;

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

function loadPaddleScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout is only available in a browser."));
  if (window.Paddle) return Promise.resolve(window.Paddle);
  if (paddleScriptPromise) return paddleScriptPromise;

  paddleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wavo-paddle="true"]');
    const script = existing || document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.dataset.wavoPaddle = "true";
    script.onload = () => window.Paddle ? resolve(window.Paddle) : reject(new Error("Paddle checkout did not initialize."));
    script.onerror = () => reject(new Error("Could not load secure checkout. Please try again."));
    if (!existing) document.head.appendChild(script);
  }).catch((error) => {
    paddleScriptPromise = null;
    throw error;
  });

  return paddleScriptPromise;
}

async function initializePaddle(configuration) {
  const Paddle = await loadPaddleScript();
  if (!paddleInitializedToken) {
    if (configuration.environment === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({
      token: configuration.clientToken,
      eventCallback: (event) => {
        if (event?.name === "checkout.completed") {
          window.dispatchEvent(new Event("wavo:paddle-checkout-completed"));
        }
      },
    });
    paddleInitializedToken = configuration.clientToken;
  } else if (paddleInitializedToken !== configuration.clientToken) {
    throw new Error("Paddle is already initialized with a different client token. Reload the page after changing payment settings.");
  }
  return Paddle;
}

export default function BillingClient() {
  const [data, setData] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState("");
  const [notice, setNotice] = useState("");
  const [paddleReady, setPaddleReady] = useState(false);

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

  useEffect(() => {
    if (!data?.paddle?.enabled || !data.paddle.clientToken) return undefined;
    let active = true;
    initializePaddle(data.paddle)
      .then(() => { if (active) setPaddleReady(true); })
      .catch((error) => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, [data?.paddle?.enabled, data?.paddle?.clientToken, data?.paddle?.environment]);

  useEffect(() => {
    function handleCheckoutCompleted() {
      setNotice("Payment completed. Paddle is confirming your subscription; refresh this page shortly to see the activated plan.");
    }
    window.addEventListener("wavo:paddle-checkout-completed", handleCheckoutCompleted);
    return () => window.removeEventListener("wavo:paddle-checkout-completed", handleCheckoutCompleted);
  }, []);

  async function requestPlan(plan) {
    setRequesting(plan);
    setNotice("");
    try {
      if (data?.paddle?.enabled) {
        const priceId = data.paddle.priceIds?.[plan]?.[cycle];
        if (!paddleReady || !window.Paddle || !priceId || !data.checkoutContext) {
          throw new Error("Secure checkout is not ready. Refresh the page or contact support.");
        }
        window.Paddle.Checkout.open({
          items: [{ priceId, quantity: 1 }],
          customData: {
            workspaceId: data.checkoutContext.workspaceId,
            ownerId: data.checkoutContext.ownerId,
            plan,
            billingCycle: cycle,
          },
          ...(data.checkoutContext.email ? { customer: { email: data.checkoutContext.email } } : {}),
          settings: {
            displayMode: "overlay",
            theme: "light",
            successUrl: window.location.origin + "/dashboard/billing?checkout=success",
          },
        });
        setNotice("Complete payment in the secure Paddle checkout. Your plan activates automatically after payment confirmation.");
        return;
      }

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
  const hasExistingSubscription = currentPlan !== "free" || data?.hasPaddleSubscription === true;

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
            <p className="mt-1 text-sm text-slate-500">{data?.paymentEnabled ? "Pay securely through Paddle. Subscription access is updated after a verified webhook." : "Request an upgrade. Prices are published by InBox Corporation; activation is reviewed manually."}</p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {["monthly", "yearly"].map((value) => <button key={value} type="button" onClick={() => setCycle(value)} className={`rounded-lg px-3 py-2 text-sm font-medium capitalize ${cycle === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{value}</button>)}
          </div>
        </div>
        {data?.paymentEnabled && hasExistingSubscription && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This workspace already has a paid or existing subscription. Contact support to change or cancel it; a second recurring subscription cannot be started from here.</p>}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const price = pricing.plans?.[plan.id]?.[cycle + "Minor"];
            const blockedBySubscription = data?.paymentEnabled && hasExistingSubscription && !isCurrent;
            const checkoutLoading = data?.paymentEnabled && !paddleReady;
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
              <button type="button" disabled={loading || !!data?.pendingRequest || isCurrent || !!requesting || blockedBySubscription || checkoutLoading} onClick={() => requestPlan(plan.id)} className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {requesting === plan.id ? "Opening…" : isCurrent ? "Current plan" : blockedBySubscription ? "Contact support" : checkoutLoading ? "Loading checkout…" : data?.paymentEnabled ? "Subscribe securely" : data?.pendingRequest ? "Request pending" : "Request this plan"}
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

      <p className="text-xs leading-5 text-slate-500">{data?.paymentEnabled ? "Paddle processes checkout and recurring renewals. Wavo changes subscription access only after verifying Paddle's signed webhook. Existing subscriptions must be changed or canceled through support until self-service management is enabled." : "Payments, invoices, and automatic renewals are not enabled yet. Submitting a request does not charge your account or change your plan. Usage shows your current totals against the included limits for your selected plan."}</p>
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
