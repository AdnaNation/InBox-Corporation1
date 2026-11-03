"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCheck, MessageCircle, Send, Users, AlertCircle, RefreshCw } from "lucide-react";

const ranges = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function number(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function StatCard({ label, value, detail, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        <span className="rounded-xl bg-green-50 p-2.5 text-green-700"><Icon size={19} /></span>
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default function AnalyticsClient() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (selectedRange = range, signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/analytics?range=${selectedRange}`, {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not load analytics.");
      setData(result);
    } catch (loadError) {
      if (loadError.name !== "AbortError") setError(loadError.message || "Could not load analytics.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const controller = new AbortController();
    load(range, controller.signal);
    return () => controller.abort();
  }, [range, load]);

  const maxDaily = useMemo(() => {
    if (!data?.daily?.length) return 1;
    return Math.max(1, ...data.daily.map((item) => item.inbound + item.outbound));
  }, [data]);

  const campaignTotal = Object.values(data?.campaigns || {}).reduce((sum, value) => sum + value, 0);
  const recipientTotal = Object.values(data?.recipients || {}).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Messaging activity and campaign performance for this workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {ranges.map((item) => (
              <button key={item.value} type="button" onClick={() => setRange(item.value)} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${range === item.value ? "bg-green-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => load()} disabled={loading} aria-label="Refresh analytics" className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={17} />{error}</div>}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading workspace analytics…</div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total messages" value={number(data.totals.messages)} detail={`${number(data.totals.inbound)} received · ${number(data.totals.outbound)} sent`} icon={MessageCircle} />
            <StatCard label="Delivery rate" value={`${data.totals.deliveryRate}%`} detail={`${number(data.totals.deliveredOrRead)} delivered or read`} icon={CheckCheck} />
            <StatCard label="Open conversations" value={number(data.totals.openConversations)} detail={`${number(data.totals.conversationsCreated)} created in this period`} icon={Users} />
            <StatCard label="Campaigns created" value={number(campaignTotal)} detail={`${number(recipientTotal)} recipient records in this period`} icon={Send} />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Message activity</h2>
                <p className="mt-1 text-xs text-slate-500">Daily inbound and outbound messages (UTC dates).</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-600" />Received</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />Sent</span>
              </div>
            </div>
            <div className="mt-6 overflow-x-auto pb-2">
              <div className="flex h-48 min-w-max items-end gap-2 border-b border-slate-100 px-1">
                {data.daily.map((item) => {
                  const inboundHeight = Math.max(0, (item.inbound / maxDaily) * 150);
                  const outboundHeight = Math.max(0, (item.outbound / maxDaily) * 150);
                  return (
                    <div key={item.date} className="flex h-full w-7 flex-col items-center justify-end gap-1">
                      <div className="flex h-[150px] w-full items-end justify-center gap-0.5">
                        <div title={`${item.inbound} received`} className="w-3 rounded-t bg-green-600" style={{ height: `${inboundHeight}px` }} />
                        <div title={`${item.outbound} sent`} className="w-3 rounded-t bg-sky-500" style={{ height: `${outboundHeight}px` }} />
                      </div>
                      <span className="mb-1 text-[9px] text-slate-400">{item.date.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="font-semibold text-slate-900">Campaign status</h2>
              <p className="mt-1 text-xs text-slate-500">Campaigns created during the selected period.</p>
              <div className="mt-5 space-y-3">
                {Object.entries(data.campaigns).length ? Object.entries(data.campaigns).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <div key={status}>
                    <div className="mb-1.5 flex justify-between text-sm"><span className="capitalize text-slate-600">{status.replaceAll("_", " ")}</span><span className="font-semibold tabular-nums">{number(count)}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-green-600" style={{ width: `${campaignTotal ? (count / campaignTotal) * 100 : 0}%` }} /></div>
                  </div>
                )) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No campaigns created in this period.</p>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="font-semibold text-slate-900">Recipient delivery status</h2>
              <p className="mt-1 text-xs text-slate-500">Recipient records created with campaigns in this period.</p>
              <div className="mt-5 space-y-3">
                {Object.entries(data.recipients).length ? Object.entries(data.recipients).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm capitalize text-slate-600"><Activity size={15} className="text-slate-400" />{status.replaceAll("_", " ")}</span>
                    <span className="text-sm font-semibold tabular-nums">{number(count)}</span>
                  </div>
                )) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No campaign recipients in this period.</p>}
              </div>
            </section>
          </div>
          <p className="text-xs leading-5 text-slate-400">Delivery metrics depend on Meta status webhooks. “Delivered or read” includes messages whose latest recorded status is delivered or read. All data is limited to your workspace.</p>
        </>
      ) : null}
    </div>
  );
}
