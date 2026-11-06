"use client";

import { useCallback, useEffect, useState } from "react";

const LABELS = {
  contacts: "Contacts",
  messages: "Outbound messages",
  campaigns: "Campaigns created",
};

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function UsageCard({ resource, used, limit }) {
  const percentage = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const remaining = Math.max(0, limit - used);
  const isNearLimit = percentage >= 80;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{LABELS[resource]}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {formatNumber(used)}
            <span className="ml-1 text-sm font-normal text-slate-400">
              / {formatNumber(limit)}
            </span>
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isNearLimit ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {Math.round(percentage)}% used
        </span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${isNearLimit ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {formatNumber(remaining)} {resource === "contacts" ? "contact slots" : resource === "messages" ? "messages" : "campaigns"} remaining
      </p>
    </section>
  );
}

export default function UsagePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/usage", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load usage.");
      }
      setData(result);
    } catch (err) {
      setError(err.message || "Unable to load usage.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const resetDate = data?.period?.resetsAt
    ? new Date(data.period.resetsAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : "";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-7 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-700">Workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Usage & limits</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Track your workspace activity and see how much of your monthly plan allowance remains.
          </p>
        </div>
        <button
          type="button"
          onClick={loadUsage}
          disabled={loading}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading workspace usage…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
          <button type="button" onClick={loadUsage} className="ml-3 font-semibold underline">Try again</button>
        </div>
      ) : data ? (
        <>
          <section className="rounded-2xl bg-slate-950 p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-300">Current plan</p>
                <h2 className="mt-1 text-2xl font-bold capitalize">{data.plan}</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Monthly allowances {resetDate ? `reset on ${resetDate}` : "reset at the start of each month"}.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data.workspaceStatus === "active" ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}>
                {data.workspaceStatus === "active" ? "Workspace active" : "Workspace suspended"}
              </span>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-3">
            {["contacts", "messages", "campaigns"].map((resource) => (
              <UsageCard
                key={resource}
                resource={resource}
                used={data.usage[resource]}
                limit={data.limits[resource]}
              />
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">How usage is counted</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>Contacts: all contacts currently stored in this workspace.</li>
              <li>Outbound messages: messages accepted by WhatsApp during the current UTC month.</li>
              <li>Campaigns: campaigns created during the current UTC month.</li>
            </ul>
            <p className="mt-4 text-xs text-slate-400">
              Usage figures are informational. Plan limits are still enforced by the relevant server-side actions.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
