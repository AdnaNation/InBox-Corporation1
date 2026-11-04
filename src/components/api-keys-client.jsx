"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

export default function ApiKeysClient() {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadKeys() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/api-keys");
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load API keys.");
      setKeys(data.keys || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadKeys(); }, []);

  async function createKey(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: ["contacts:read"] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not create API key.");
      setSecret(data.key.secret); setName(""); setNotice(data.message); await loadKeys();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function revokeKey(id) {
    if (!window.confirm("Revoke this API key? Any integration using it will stop working.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/api-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not revoke API key.");
      setNotice(data.message); await loadKeys();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); setNotice("Copied to clipboard."); }
    catch { setError("Clipboard access failed. Select and copy the key manually."); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-green-50 p-3 text-green-700"><KeyRound size={20} /></span>
          <div><h2 className="font-semibold text-slate-900">Create an API key</h2><p className="text-sm text-slate-500">Use a key to access your workspace contacts from an external application.</p></div>
        </div>
        <form onSubmit={createKey} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="e.g. Website integration" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600" />
          <button disabled={busy || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Plus size={17} /> Generate key</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Permission: Read contacts. More API permissions will be added as endpoints become available.</p>
      </div>

      {secret && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <p className="font-semibold text-amber-900">Copy your new API key now</p>
        <p className="mt-1 text-sm text-amber-800">For security, the full key is shown only once. Store it in a server-side environment variable. Never expose it in browser code.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white p-3 text-xs">{secret}</code><button onClick={() => copy(secret)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900"><Copy size={15} /> Copy key</button></div>
        <button onClick={() => setSecret("")} className="mt-3 text-xs font-semibold text-amber-900 underline">I've saved this key</button>
      </div>}

      {(error || notice) && <p role="status" className={`rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Your API keys</h2><p className="mt-1 text-sm text-slate-500">Keys are isolated to this workspace.</p></div><button onClick={loadKeys} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Refresh API keys"><RefreshCw size={17} /></button></div>
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading keys...</p> : keys.length === 0 ? <div className="py-10 text-center"><ShieldCheck className="mx-auto text-slate-300" size={30} /><p className="mt-2 text-sm text-slate-500">No API keys created yet.</p></div> : <div className="mt-4 divide-y divide-slate-100">{keys.map((key) => <div key={key.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{key.name}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${key.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{key.status}</span></div><code className="mt-1 block text-xs text-slate-500">{key.prefix}••••••••</code><p className="mt-1 text-xs text-slate-400">Created {new Date(key.createdAt).toLocaleString()} · Last used {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</p><p className="mt-1 text-xs text-slate-500">{key.scopes.join(", ")}</p></div>{key.status === "active" && <button disabled={busy} onClick={() => revokeKey(key.id)} className="inline-flex items-center gap-2 self-start rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14} /> Revoke</button>}</div>)}</div>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 className="text-sm font-semibold text-slate-800">Quick start: read contacts</h3><p className="mt-1 text-xs text-slate-500">Make this request from your server. Replace YOUR_API_KEY with the key you generated.</p><pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-green-300">{`curl https://inbox-corporation-new.vercel.app/api/v1/contacts \\\n  -H "Authorization: Bearer YOUR_API_KEY"`}</pre></div>
    </div>
  );
}
