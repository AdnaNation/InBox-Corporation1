"use client";

import { useEffect, useState } from "react";
import { Activity, Copy, Globe, Plus, RefreshCw, RotateCcw, Send, Trash2 } from "lucide-react";
import { showConfirm } from "@/lib/swal";

const eventOptions = [
  ["message.received", "Incoming message"],
  ["message.status_updated", "Message status update"],
  ["campaign.created", "Campaign created"],
  ["campaign.queued", "Campaign queued or scheduled"],
  ["campaign.paused", "Campaign paused"],
  ["campaign.resumed", "Campaign resumed"],
  ["campaign.cancelled", "Campaign cancelled"],
  ["campaign.completed", "Campaign completed"],
];

export default function WebhookManager() {
  const [items, setItems] = useState([]);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState(["message.received", "message.status_updated"]);
  const [secret, setSecret] = useState("");
  const [secretNotice, setSecretNotice] = useState("Save your signing secret now");
  const [logs, setLogs] = useState({});
  const [deliveryPages, setDeliveryPages] = useState({});
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/webhooks", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load webhook subscriptions.");
      setItems(data.data || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function toggleEvent(value) {
    setEvents((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function create(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/webhooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, description, events }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not create webhook.");
      setSecret(data.secret || ""); setSecretNotice("Save your signing secret now"); setUrl(""); setDescription("");
      setEvents(["message.received", "message.status_updated"]);
      setNotice(data.message || "Webhook created.");
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function disable(id) {
    if (!(await showConfirm({ title: "Disable webhook?", text: "Pending deliveries will be cancelled and no new events will be sent.", confirmButtonText: "Disable webhook" }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/webhooks?id=" + encodeURIComponent(id), { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not disable webhook.");
      setNotice(data.message); await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function sendTest(id) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/webhooks/" + encodeURIComponent(id) + "/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not queue test webhook.");
      setNotice(data.message || "Test webhook queued.");
      if (expanded === id) {
        const history = await fetch("/api/webhooks/" + encodeURIComponent(id) + "/deliveries?limit=20", { cache: "no-store" });
        const historyData = await history.json();
        if (history.ok) {
          setLogs((current) => ({ ...current, [id]: historyData.data || [] }));
          setDeliveryPages((current) => ({ ...current, [id]: historyData.pagination || { hasMore: false, nextCursor: null } }));
        }
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function rotateSecret(id) {
    if (!(await showConfirm({ title: "Rotate signing secret?", text: "The current secret becomes invalid immediately. Update your receiver with the new secret as soon as it is shown.", confirmButtonText: "Rotate secret" }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/webhooks/" + encodeURIComponent(id) + "/rotate-secret", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not rotate webhook secret.");
      setSecret(data.secret || "");
      setSecretNotice("New signing secret — save it now");
      setNotice(data.message || "Webhook signing secret rotated.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function showDeliveries(id) {
    if (expanded === id) { setExpanded(""); return; }
    setExpanded(id);
    try {
      const response = await fetch("/api/webhooks/" + encodeURIComponent(id) + "/deliveries?limit=20", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load delivery history.");
      setLogs((current) => ({ ...current, [id]: data.data || [] }));
      setDeliveryPages((current) => ({ ...current, [id]: data.pagination || { hasMore: false, nextCursor: null } }));
    } catch (err) { setError(err.message); }
  }

  async function loadMoreDeliveries(id) {
    const cursor = deliveryPages[id]?.nextCursor;
    if (!cursor || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/webhooks/" + encodeURIComponent(id) + "/deliveries?limit=20&before=" + encodeURIComponent(cursor), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load older deliveries.");
      setLogs((current) => ({ ...current, [id]: [...(current[id] || []), ...(data.data || [])] }));
      setDeliveryPages((current) => ({ ...current, [id]: data.pagination || { hasMore: false, nextCursor: null } }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function retryDelivery(subscriptionId, deliveryId) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/webhooks/" + encodeURIComponent(subscriptionId) + "/deliveries/" + encodeURIComponent(deliveryId) + "/retry", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not retry webhook delivery.");
      setNotice(data.message || "Webhook delivery queued for another attempt.");
      const history = await fetch("/api/webhooks/" + encodeURIComponent(subscriptionId) + "/deliveries?limit=20", { cache: "no-store" });
      const historyData = await history.json();
      if (history.ok) {
        setLogs((current) => ({ ...current, [subscriptionId]: historyData.data || [] }));
        setDeliveryPages((current) => ({ ...current, [subscriptionId]: historyData.pagination || { hasMore: false, nextCursor: null } }));
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function copySecret() {
    try { await navigator.clipboard.writeText(secret); setNotice("Signing secret copied."); }
    catch { setError("Clipboard access failed. Select and copy the secret manually."); }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Globe size={20} /></span>
        <div><h2 className="font-semibold text-slate-900">Webhook subscriptions</h2><p className="text-sm text-slate-500">Send signed Wavo events to your own server.</p></div>
      </div>
      <form onSubmit={create} className="mt-5 space-y-4">
        <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} required placeholder="https://example.com/webhooks/wavo" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600" />
        <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} placeholder="Description (optional)" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-green-600" />
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Events to send</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {eventOptions.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-green-300"><input type="checkbox" checked={events.includes(value)} onChange={() => toggleEvent(value)} className="h-4 w-4 accent-green-600" />{label}</label>)}
          </div>
        </div>
        <p className="text-xs leading-5 text-slate-500">HTTPS only. Local/private destinations are blocked during delivery. Signing secrets are encrypted at rest.</p>
        <button disabled={busy || !url.trim() || !events.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><Plus size={17} /> Create webhook</button>
      </form>

      {secret && <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <p className="font-semibold text-amber-900">{secretNotice}</p>
        <p className="mt-1 text-xs text-amber-800">It is shown only once. Use it to verify the timestamped HMAC-SHA256 signature.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all rounded-lg border border-amber-200 bg-white p-3 text-xs">{secret}</code><button type="button" onClick={copySecret} className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900"><Copy size={15} /> Copy secret</button></div>
        <button type="button" onClick={() => setSecret("")} className="mt-3 text-xs font-semibold text-amber-900 underline">I've saved this secret</button>
      </div>}

      {(error || notice) && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{error || notice}</p>}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Configured endpoints</h3><p className="mt-1 text-xs text-slate-500">Inspect delivery attempts or disable an endpoint.</p></div><button type="button" onClick={load} disabled={loading} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50" aria-label="Refresh webhooks"><RefreshCw size={17} /></button></div>
        {loading ? <p className="py-6 text-center text-sm text-slate-500">Loading webhooks…</p> : items.length === 0 ? <div className="py-8 text-center"><Globe className="mx-auto text-slate-300" size={28} /><p className="mt-2 text-sm text-slate-500">No webhook endpoints configured.</p></div> : (
          <div className="mt-3 divide-y divide-slate-100">
            {items.map((item) => <div key={item.id} className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{item.description || "Webhook endpoint"}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{item.status}</span></div><code className="mt-1 block break-all text-xs text-slate-500">{item.url}</code><p className="mt-1 text-xs text-slate-400">Events: {item.events.join(", ")}</p><p className="mt-1 text-xs text-slate-400">Last delivery: {item.lastDeliveryAt ? new Date(item.lastDeliveryAt).toLocaleString() : "Never"}</p></div>
                <div className="flex shrink-0 flex-wrap gap-2">{item.status === "active" && <button type="button" disabled={busy} onClick={() => sendTest(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Send size={14} /> Send test</button>}{item.status === "active" && <button type="button" disabled={busy} onClick={() => rotateSecret(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"><RotateCcw size={14} /> Rotate secret</button>}<button type="button" onClick={() => showDeliveries(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Activity size={14} /> Deliveries</button>{item.status === "active" && <button type="button" disabled={busy} onClick={() => disable(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14} /> Disable</button>}</div>
              </div>
              {expanded === item.id && <div className="mt-3 rounded-xl bg-slate-50 p-3">{!logs[item.id] ? <p className="text-xs text-slate-500">Loading delivery history…</p> : logs[item.id].length === 0 ? <p className="text-xs text-slate-500">No deliveries yet.</p> : <div className="space-y-2">{logs[item.id].map((delivery) => <div key={delivery.id} className="flex flex-col gap-1 border-b border-slate-200 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-slate-800">{delivery.type} · {delivery.status}</p><p className="text-[11px] text-slate-500">{delivery.eventId} · {delivery.attempts} attempt(s){delivery.manualRetries > 0 ? ` · ${delivery.manualRetries} manual retry(s)` : ""}</p>{delivery.lastError && <p className="text-[11px] text-red-600">{delivery.lastError}</p>}</div><div className="flex items-center gap-2"><p className="text-[11px] text-slate-400">{delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : delivery.nextAttemptAt ? "Retry " + new Date(delivery.nextAttemptAt).toLocaleString() : new Date(delivery.createdAt).toLocaleString()}</p>{delivery.status === "failed" && item.status === "active" && <button type="button" disabled={busy} onClick={() => retryDelivery(item.id, delivery.id)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"><RefreshCw size={12} /> Retry</button>}</div></div>)}</div>}{deliveryPages[item.id]?.hasMore && <button type="button" disabled={busy} onClick={() => loadMoreDeliveries(item.id)} className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50">{busy ? "Loading…" : "Load older deliveries"}</button>}</div>}
            </div>)}
          </div>
        )}
      </div>
    </section>
  );
}
