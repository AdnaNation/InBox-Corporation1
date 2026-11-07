"use client";

import { useState } from "react";

const date = (value) => value ? new Date(value).toLocaleString() : "—";

export default function PlatformWhatsAppInventory({ accounts = [] }) {
  const [selected, setSelected] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [nextCursor, setNextCursor] = useState(null);

  async function loadTemplates(account, after = null, append = false) {
    if (!append) {
      setSelected(account);
      setTemplates([]);
      setTemplateError("");
      setNextCursor(null);
    }
    setLoadingTemplates(true);
    try {
      const query = new URLSearchParams({
        workspaceId: account.workspaceId,
        phoneNumberId: account.phoneNumberId,
      });
      if (after) query.set("after", after);
      const response = await fetch(`/api/platform-admin/templates?${query.toString()}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Could not load templates.");
      }
      setTemplates((current) => append ? [...current, ...(result.templates || [])] : result.templates || []);
      setNextCursor(result.nextCursor || null);
    } catch (error) {
      setTemplateError(error.message || "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-5">
        <h2 className="font-bold text-slate-900">Customer WhatsApp numbers</h2>
        <p className="mt-1 text-sm text-slate-500">
          Inspect connected business numbers and their Meta template status. Credentials and access tokens are never returned to the browser.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Workspace</th>
              <th className="px-5 py-3">Business</th>
              <th className="px-5 py-3">WhatsApp number</th>
              <th className="px-5 py-3">Phone Number ID</th>
              <th className="px-5 py-3">Connection</th>
              <th className="px-5 py-3">Last updated</th>
              <th className="px-5 py-3">Templates</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <tr key={account.id}>
                <td className="px-5 py-4">
                  <p className="font-semibold text-slate-900">{account.workspaceName}</p>
                  <p className="text-xs text-slate-500">{account.workspaceSlug}</p>
                </td>
                <td className="px-5 py-4 text-slate-700">{account.businessName || "—"}</td>
                <td className="px-5 py-4 text-slate-700">{account.displayPhoneNumber || "—"}</td>
                <td className="px-5 py-4 font-mono text-xs text-slate-500">{account.phoneNumberId || "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${account.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {account.status}
                    </span>
                    {account.status === "connected" && account.isActive && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Active line</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500">{date(account.updatedAt || account.createdAt)}</td>
                <td className="px-5 py-4">
                  <button
                    type="button"
                    disabled={account.status !== "connected" || !account.phoneNumberId || loadingTemplates}
                    onClick={() => loadTemplates(account)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loadingTemplates && selected?.id === account.id ? "Loading…" : "View templates"}
                  </button>
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan="7" className="px-5 py-10 text-center text-slate-500">No WhatsApp accounts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="border-t border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Meta templates · {selected.businessName || selected.displayPhoneNumber}</h3>
              <p className="mt-1 text-xs text-slate-500">{selected.workspaceName} · {selected.displayPhoneNumber}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Close</button>
          </div>
          {loadingTemplates && !templates.length ? (
            <p className="mt-4 text-sm text-slate-500">Loading templates from Meta…</p>
          ) : templateError ? (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{templateError}</p>
          ) : templates.length ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Template</th><th className="px-4 py-3">Language</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Quality</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{template.name}</td>
                      <td className="px-4 py-3 text-slate-600">{template.language}</td>
                      <td className="px-4 py-3 text-slate-600">{template.category}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{template.status}</span>
                        {template.rejectedReason && <p className="mt-1 max-w-xs text-xs text-red-600">{template.rejectedReason}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{template.qualityScore || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-white p-4 text-sm text-slate-500">No templates were returned for this WhatsApp Business Account.</p>
          )}
          {nextCursor && <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">More templates are available from Meta.</p><button type="button" disabled={loadingTemplates} onClick={() => loadTemplates(selected, nextCursor, true)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{loadingTemplates ? "Loading…" : "Load more templates"}</button></div>}
        </div>
      )}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        Showing up to 200 connection records. Template inspection is read-only; this view does not edit or delete customer templates.
      </p>
    </section>
  );
}
