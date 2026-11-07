"use client";

import { useEffect, useState } from "react";
import { Download, ShieldAlert, RefreshCw, Send } from "lucide-react";

const labels = {
  export: "Data export",
  deletion: "Workspace deletion",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function WorkspaceDataRequests() {
  const [requests, setRequests] = useState([]);
  const [type, setType] = useState("export");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace/data-requests", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load request history.");
      setRequests(data.requests || []);
    } catch (err) {
      setError(err.message || "Could not load request history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/workspace/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, confirmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not submit request.");
      setNotice(data.message || "Request submitted.");
      setConfirmed(false);
      await load();
    } catch (err) {
      setError(err.message || "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><ShieldAlert size={20} /></span>
        <div>
          <h2 className="font-semibold text-slate-900">Your workspace data</h2>
          <p className="mt-1 text-sm text-slate-500">Request a copy of your workspace data or ask our team to review a deletion request.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${type === "export" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200"}`}>
            <input type="radio" name="requestType" value="export" checked={type === "export"} onChange={() => { setType("export"); setConfirmed(false); }} className="mt-1 accent-emerald-600" />
            <span><span className="flex items-center gap-2 text-sm font-semibold"><Download size={16} /> Export my data</span><span className="mt-1 block text-xs text-slate-500">Ask for a secure copy of this workspace's records.</span></span>
          </label>
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${type === "deletion" ? "border-red-400 bg-red-50/50" : "border-slate-200"}`}>
            <input type="radio" name="requestType" value="deletion" checked={type === "deletion"} onChange={() => { setType("deletion"); setConfirmed(false); }} className="mt-1 accent-red-600" />
            <span><span className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert size={16} /> Delete workspace</span><span className="mt-1 block text-xs text-slate-500">Request identity, dependency, and retention review before deletion.</span></span>
          </label>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 accent-emerald-600" />
          <span>I am the workspace owner and authorize this request for <strong>{type === "export" ? "a data export" : "a workspace deletion review"}</strong>.</span>
        </label>

        {type === "deletion" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Submitting this request does not immediately delete your workspace or messages. Our team must verify ownership, check legal and retention obligations, and confirm the scope before any destructive action.</p>}

        <button type="submit" disabled={!confirmed || submitting} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Send size={16} />{submitting ? "Submitting…" : "Submit request"}
        </button>
      </form>

      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Request history</h3><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"><RefreshCw size={13} />Refresh</button></div>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading requests…</p> : requests.length === 0 ? <p className="mt-3 text-sm text-slate-500">No data requests yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-100">
            {requests.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div><p className="text-sm font-medium">{labels[item.type] || "Data request"}</p><p className="mt-0.5 text-xs text-slate-500">Submitted {formatDate(item.createdAt)}</p>{item.operatorNote && <p className="mt-1 text-xs text-slate-600">{item.operatorNote}</p>}</div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{String(item.status || "pending").replaceAll("_", " ")}</span>
            </li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
