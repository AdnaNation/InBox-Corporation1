"use client";

const date = (value) => value ? new Date(value).toLocaleString() : "—";

export default function PlatformWhatsAppInventory({ accounts = [] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-5">
        <h2 className="font-bold text-slate-900">Customer WhatsApp numbers</h2>
        <p className="mt-1 text-sm text-slate-500">
          Read-only connection inventory across customer workspaces. Credentials and access tokens are never returned.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Workspace</th>
              <th className="px-5 py-3">Business</th>
              <th className="px-5 py-3">WhatsApp number</th>
              <th className="px-5 py-3">Phone Number ID</th>
              <th className="px-5 py-3">Connection</th>
              <th className="px-5 py-3">Last updated</th>
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
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan="6" className="px-5 py-10 text-center text-slate-500">No WhatsApp accounts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
        Showing up to 200 connection records. This view does not modify customer connections.
      </p>
    </section>
  );
}
