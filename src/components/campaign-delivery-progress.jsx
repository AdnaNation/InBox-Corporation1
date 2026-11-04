"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock3, Eye, RefreshCw, Send, XCircle } from "lucide-react";

const LABELS = [
  ["pending", "Pending"],
  ["processing", "Processing"],
  ["accepted", "Accepted"],
  ["sent", "Sent"],
  ["delivered", "Delivered"],
  ["read", "Read"],
  ["failed", "Failed"],
  ["unknown", "Needs review"],
  ["skipped", "Skipped"],
];

function percentage(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

export default function CampaignDeliveryProgress({ campaignId, initialStatus, initialCounts, initialTotal }) {
  const [status, setStatus] = useState(initialStatus);
  const [counts, setCounts] = useState(initialCounts);
  const [total, setTotal] = useState(initialTotal);
  const [pauseReason, setPauseReason] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      setRefreshing(true);
      try {
        const response = await fetch("/api/campaigns/" + campaignId + "/progress", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Could not refresh progress.");
        if (!active) return;
        setStatus(data.campaign.status);
        setCounts(data.counts);
        setTotal(data.campaign.total);
        setPauseReason(data.campaign.pauseReason || "");
        setLastUpdated(new Date());
        setError("");
      } catch (err) {
        if (active) setError(err.message || "Progress refresh failed.");
      } finally {
        inFlight = false;
        if (active) setRefreshing(false);
      }
    }

    if (["queued", "sending"].includes(status)) {
      refresh();
      const timer = setInterval(refresh, 5000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }

    return () => {
      active = false;
    };
  }, [campaignId, status]);

  const completed = total - (counts.pending || 0) - (counts.processing || 0);
  const delivered = (counts.delivered || 0) + (counts.read || 0);
  const accepted = (counts.accepted || 0) + (counts.sent || 0) + delivered;
  const failed = (counts.failed || 0) + (counts.unknown || 0) + (counts.skipped || 0);
  const completion = percentage(completed, total);
  const delivery = percentage(delivered, total);
  const isActive = ["queued", "sending"].includes(status);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="text-green-600" size={20} />
          <h2 className="font-semibold">Live delivery progress</h2>
          {isActive && <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">Auto-refreshing</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {lastUpdated ? "Updated " + lastUpdated.toLocaleTimeString() : isActive ? "Connecting…" : "Latest saved status"}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Recipients completed</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{completed.toLocaleString()} <span className="text-sm font-medium text-slate-400">/ {total.toLocaleString()}</span></p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-green-500 transition-all" style={{ width: completion + "%" }} /></div>
          <p className="mt-1 text-xs text-slate-500">{completion}% complete</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Delivered / read</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{delivered.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-500">{delivery}% of campaign audience</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Accepted by WhatsApp</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{accepted.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-500">Awaiting delivery updates may remain</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Failed / review / skipped</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{failed.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-500">Check individual recipient notes below</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LABELS.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
            <span className="text-sm text-slate-600">{label}</span>
            <span className="text-sm font-semibold tabular-nums">{(counts[key] || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {pauseReason && status === "paused" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Paused: {pauseReason}</p>}
      {status === "completed_with_issues" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Campaign finished, but some recipients failed, were skipped, or need manual review.</p>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!isActive && !error && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14} />Live refresh stops when the campaign is not queued or sending.</p>}
    </section>
  );
}
