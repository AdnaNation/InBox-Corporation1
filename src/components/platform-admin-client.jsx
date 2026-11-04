"use client";

import { useEffect, useState } from "react";

const number = (value) => new Intl.NumberFormat().format(value || 0);
const date = (value) => value ? new Date(value).toLocaleDateString() : "—";

export default function PlatformAdminClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/platform-admin", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Could not load platform data.");
      setData(result);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function act(key, payload, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(key);
    setNotice("");
    try {
      const response = await fetch("/api/platform-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Action failed.");
      setNotice(result.message);
      await load();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy("");
    }
  }

  if (loading && !data) return <p className="text-sm text-slate-500">Loading platform data…</p>;

  return (
    <div className="space-y-7">
      {notice && <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{notice}</div>}
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total workspaces" value={data?.stats?.totalWorkspaces} />
        <Stat label="Active workspaces" value={data?.stats?.activeWorkspaces} />
        <Stat label="Pending plan requests" value={data?.stats?.pendingRequests} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-slate-900">Plan requests</h2>
          <p className="mt-1 text-sm text-slate-500">Approving a request immediately activates the requested plan. Payment collection is not connected.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Workspace / requester</th><th className="px-5 py-3">Requested plan</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status / action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.requests || []).map((item) => <tr key={item.id}>
                <td className="px-5 py-4"><p className="font-semibold text-slate-900">{item.workspaceName || "Workspace"}</p><p className="mt-1 text-xs text-slate-500">{item.requesterName} · {item.requesterEmail}</p></td>
                <td className="px-5 py-4"><span className="font-semibold capitalize">{item.plan}</span><p className="text-xs capitalize text-slate-500">{item.billingCycle}</p></td>
                <td className="px-5 py-4 text-slate-500">{date(item.createdAt)}</td>
                <td className="px-5 py-4">
                  {item.status === "pending" ? <div className="flex gap-2"><button disabled={!!busy} onClick={() => act(item.id + ":approve", { action: "review-request", requestId: item.id, decision: "approved" }, "Approve this request and activate the plan?")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button disabled={!!busy} onClick={() => act(item.id + ":reject", { action: "review-request", requestId: item.id, decision: "rejected" }, "Reject this plan request?")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">Reject</button></div> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">{item.status}</span>}
                </td>
              </tr>)}
              {!data?.requests?.length && <tr><td colSpan="4" className="px-5 py-10 text-center text-slate-500">No plan requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-900">Customer workspaces</h2><p className="mt-1 text-sm text-slate-500">Change plans or suspend and reactivate customer workspaces.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Owner</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.workspaces || []).map((workspace) => <tr key={workspace.id}>
                <td className="px-5 py-4"><p className="font-semibold text-slate-900">{workspace.name}</p><p className="text-xs text-slate-500">{workspace.slug}</p></td>
                <td className="px-5 py-4"><p className="text-slate-700">{workspace.owner?.name || "—"}</p><p className="text-xs text-slate-500">{workspace.owner?.email || "—"}</p></td>
                <td className="px-5 py-4"><select aria-label={"Plan for " + workspace.name} value={workspace.plan} disabled={!!busy} onChange={(event) => act(workspace.id + ":plan", { action: "set-workspace-plan", workspaceId: workspace.id, plan: event.target.value }, "Change this workspace's plan?")} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs capitalize"><option value="free">Free</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="business">Business</option></select></td>
                <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${workspace.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{workspace.status}</span></td>
                <td className="px-5 py-4 text-slate-500">{date(workspace.createdAt)}</td>
                <td className="px-5 py-4"><button disabled={!!busy} onClick={() => act(workspace.id + ":status", { action: "set-workspace-status", workspaceId: workspace.id, status: workspace.status === "active" ? "suspended" : "active" }, workspace.status === "active" ? "Suspend this workspace? Its members will lose access." : "Reactivate this workspace?")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">{workspace.status === "active" ? "Suspend" : "Reactivate"}</button></td>
              </tr>)}
              {!data?.workspaces?.length && <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No workspaces found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs leading-5 text-slate-500">Workspace changes are recorded in the platform admin audit log. This console does not process payments or send customer notifications. Workspace list is limited to the latest 100 records.</p>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{number(value)}</p></div>;
}
