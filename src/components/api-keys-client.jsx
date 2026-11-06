"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { showConfirm } from "@/lib/swal";

const scopeOptions = [
  { value: "contacts:read", label: "Read contacts", description: "List workspace contacts and their opt-in status." },
  { value: "contacts:write", label: "Create and update contacts", description: "Add contacts and update names or tags. Cannot change consent or phone numbers." },
  { value: "messages:read", label: "Read message status", description: "Check accepted, sent, delivered, read, or failed status for messages in this workspace." },
  { value: "messages:send", label: "Send approved templates", description: "Send approved WhatsApp templates to existing opted-in contacts. Monthly message limits and suppression rules apply." },
  { value: "templates:read", label: "Read WhatsApp templates", description: "List templates and their current Meta approval status for the connected WhatsApp account." },
  { value: "campaigns:read", label: "Read campaigns", description: "List campaign status and aggregate delivery progress in this workspace." },
  { value: "campaigns:write", label: "Create campaign drafts", description: "Create recipient snapshots from opted-in, non-suppressed contacts. Drafts are not sent automatically." },
  { value: "webhooks:read", label: "Read webhook subscriptions", description: "List webhook endpoints and inspect recent delivery attempts." },
  { value: "webhooks:write", label: "Manage webhook subscriptions", description: "Create or disable webhook endpoints and receive signed event notifications." },
];

export default function ApiKeysClient() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["contacts:read"]);
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadKeys() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/api-keys", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load API keys.");
      setKeys(data.keys || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadKeys(); }, []);

  function toggleScope(value) {
    setScopes((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function createKey(event) {
    event.preventDefault();
    if (!scopes.length) {
      setError("Choose at least one API permission.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not create API key.");
      setSecret(data.key.secret);
      setName("");
      setScopes(["contacts:read"]);
      setNotice(data.message);
      await loadKeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id) {
    if (!(await showConfirm({ title: "Revoke API key?", text: "Any integration using this key will stop working.", confirmButtonText: "Revoke key" }))) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/api-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not revoke API key.");
      setNotice(data.message);
      await loadKeys();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Clipboard access failed. Select and copy the key manually.");
    }
  }

  const quickStart = `# Read contacts
curl "https://inbox-corporation-new.vercel.app/api/v1/contacts?limit=100" \\
  -H "Authorization: Bearer YOUR_API_KEY"

# Create a contact (not opted in by default)
curl -X POST "https://inbox-corporation-new.vercel.app/api/v1/contacts" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane Doe","phone":"+14155550123","optedIn":false,"tags":["website"]}'

# Update a contact's name and tags
curl -X PATCH "https://inbox-corporation-new.vercel.app/api/v1/contacts/CONTACT_ID" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane Smith","tags":["customer","website"]}'`;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-green-50 p-3 text-green-700"><KeyRound size={20} /></span>
          <div>
            <h2 className="font-semibold text-slate-900">Create an API key</h2>
            <p className="text-sm text-slate-500">Give an external application only the permissions it needs.</p>
          </div>
        </div>
        <form onSubmit={createKey} className="mt-5 space-y-4">
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required placeholder="e.g. Website integration" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600" />
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-800">Permissions</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {scopeOptions.map((scope) => (
                <label key={scope.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-green-300">
                  <input type="checkbox" checked={scopes.includes(scope.value)} onChange={() => toggleScope(scope.value)} className="mt-1 h-4 w-4 accent-green-600" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{scope.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{scope.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <button disabled={busy || !name.trim() || !scopes.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
            <Plus size={17} /> Generate API key
          </button>
        </form>
      </section>

      {secret && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Copy your new API key now</p>
          <p className="mt-1 text-sm text-amber-800">For security, the full key is shown only once. Store it in a server-side environment variable. Never expose it in browser code.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white p-3 text-xs">{secret}</code>
            <button type="button" onClick={() => copy(secret)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900"><Copy size={15} /> Copy key</button>
          </div>
          <button type="button" onClick={() => setSecret("")} className="mt-3 text-xs font-semibold text-amber-900 underline">I've saved this key</button>
        </section>
      )}

      {(error || notice) && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-semibold text-slate-900">Your API keys</h2><p className="mt-1 text-sm text-slate-500">Keys are isolated to this workspace.</p></div>
          <button type="button" onClick={loadKeys} disabled={loading} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Refresh API keys"><RefreshCw size={17} /></button>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading keys…</p>
        ) : keys.length === 0 ? (
          <div className="py-10 text-center"><ShieldCheck className="mx-auto text-slate-300" size={30} /><p className="mt-2 text-sm text-slate-500">No API keys created yet.</p></div>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{key.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${key.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{key.status}</span>
                  </div>
                  <code className="mt-1 block text-xs text-slate-500">{key.prefix}••••••••</code>
                  <p className="mt-1 text-xs text-slate-400">Created {new Date(key.createdAt).toLocaleString()} · Last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</p>
                  <p className="mt-1 text-xs text-slate-500">{key.scopes.join(", ")}</p>
                </div>
                {key.status === "active" && <button type="button" disabled={busy} onClick={() => revokeKey(key.id)} className="inline-flex items-center gap-2 self-start rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14} /> Revoke</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <h3 className="text-sm font-semibold text-slate-800">API quick start</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Make requests from your server. Include the Bearer key in the Authorization header. Contact creation does not grant marketing consent; to mark a contact as opted in, the request must include documented consent evidence.</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-green-300">{quickStart}</pre>
      </section>
    </div>
  );
}
