"use client";

import { useEffect, useState } from "react";
import { showConfirm } from "@/lib/swal";
import PlatformWhatsAppInventory from "@/components/platform-whatsapp-inventory";

const number = (value) => new Intl.NumberFormat().format(value || 0);
const date = (value) => value ? new Date(value).toLocaleDateString() : "—";

export default function PlatformAdminClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [dataRequestNotes, setDataRequestNotes] = useState({});

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
    if (confirmMessage && !(await showConfirm({ title: "Confirm platform action", text: confirmMessage, confirmButtonText: "Confirm action" }))) return;
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
      if (payload.action === "review-data-request") setDataRequestNotes((current) => ({ ...current, [payload.requestId]: "" }));
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
          <p className="mt-1 text-sm text-slate-500">{data?.paymentEnabled ? "Paddle checkout is enabled; only verified payments can activate paid plans." : "Approving a request immediately activates the requested plan. Payment collection is not connected."}</p>
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
                  {item.status === "pending" ? <div className="flex flex-wrap items-center gap-2">{data?.paymentEnabled ? <span className="text-xs font-medium text-amber-700">Verified Paddle payment required</span> : <button disabled={!!busy} onClick={() => act(item.id + ":approve", { action: "review-request", requestId: item.id, decision: "approved" }, "Approve this request and activate the plan?")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button>}<button disabled={!!busy} onClick={() => act(item.id + ":reject", { action: "review-request", requestId: item.id, decision: "rejected" }, "Reject this plan request?")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">Reject</button></div> : <div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">{item.status}</span>{item.activationStatus === "needs_attention" && <p className="mt-2 max-w-48 text-xs font-medium text-amber-700">Plan activation needs manual verification.</p>}</div>}
                </td>
              </tr>)}
              {!data?.requests?.length && <tr><td colSpan="4" className="px-5 py-10 text-center text-slate-500">No plan requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-slate-900">Customer data requests</h2>
          <p className="mt-1 text-sm text-slate-500">Review export and deletion requests. Completing a deletion request means the approved offboarding work has actually been completed; this console does not delete records automatically.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Workspace / owner</th><th className="px-5 py-3">Request</th><th className="px-5 py-3">Submitted</th><th className="px-5 py-3">Status / action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.dataRequests || []).map((item) => <tr key={item.id}>
                <td className="px-5 py-4"><p className="font-semibold text-slate-900">{item.workspaceName}</p><p className="mt-1 text-xs text-slate-500">{item.requesterName} · {item.requesterEmail}</p></td>
                <td className="px-5 py-4"><span className="font-semibold">{item.type === "deletion" ? "Workspace deletion" : "Data export"}</span><p className="mt-1 text-xs text-slate-500">ID: {item.id.slice(-8)}</p></td>
                <td className="px-5 py-4 text-slate-500">{date(item.createdAt)}</td>
                <td className="px-5 py-4">
                  {["pending", "in_review"].includes(item.status) ? <div className="min-w-56 space-y-2">
                    <textarea aria-label={"Operator note for " + item.workspaceName} value={dataRequestNotes[item.id] || ""} onChange={(event) => setDataRequestNotes((current) => ({ ...current, [item.id]: event.target.value.slice(0, 500) }))} rows={2} maxLength={500} placeholder="Add a short audit note (required to close)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-400" />
                    {item.status === "pending" && <button disabled={!!busy} onClick={() => act(item.id + ":review", { action: "review-data-request", requestId: item.id, status: "in_review" }, "Move this customer data request into review?")} className="mr-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Start review</button>}
                    {item.status === "in_review" && <button disabled={!!busy || !(dataRequestNotes[item.id] || "").trim()} onClick={() => act(item.id + ":complete", { action: "review-data-request", requestId: item.id, status: "completed", note: dataRequestNotes[item.id] }, item.type === "deletion" ? "Confirm that identity, retention, legal checks and the approved deletion process have all been completed." : "Confirm that the export has been prepared and delivered securely to the verified workspace owner.")} className="mr-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Mark completed</button>}
                    <button disabled={!!busy || !(dataRequestNotes[item.id] || "").trim()} onClick={() => act(item.id + ":reject", { action: "review-data-request", requestId: item.id, status: "rejected", note: dataRequestNotes[item.id] }, "Reject this data request? The reason will be visible to the workspace owner.")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50">Reject</button>
                  </div> : <div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{String(item.status).replaceAll("_", " ")}</span>{item.operatorNote && <p className="mt-2 max-w-64 text-xs text-slate-600">{item.operatorNote}</p>}</div>}
                </td>
              </tr>)}
              {!data?.dataRequests?.length && <tr><td colSpan="4" className="px-5 py-10 text-center text-slate-500">No customer data requests yet.</td></tr>}
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
      <PlatformWhatsAppInventory accounts={data?.whatsappAccounts || []} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-5">
          <h2 className="font-bold text-slate-900">Platform audit history</h2>
          <p className="mt-1 text-sm text-slate-500">Latest 50 administrative actions, including pricing changes, plan approvals, and workspace changes.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Action</th><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Performed by</th><th className="px-5 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.auditLogs || []).map((log) => <tr key={log.id}>
                <td className="px-5 py-4 font-medium text-slate-800">{String(log.action || "admin_action").replaceAll("_", " ")}</td>
                <td className="px-5 py-4 text-slate-700">{log.workspaceName}</td>
                <td className="px-5 py-4 text-slate-500">{log.actor?.email || log.actor?.name || "Platform admin"}</td>
                <td className="px-5 py-4 text-slate-500">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</td>
              </tr>)}
              {!data?.auditLogs?.length && <tr><td colSpan="4" className="px-5 py-10 text-center text-slate-500">No administrative actions recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs leading-5 text-slate-500">This console does not process payments or send customer notifications. Workspace list is limited to the latest 100 records and audit history to the latest 50 actions.</p>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{number(value)}</p></div>;
}
