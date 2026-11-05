"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";

const initial = { name: "", language: "en_US", category: "UTILITY", header: "", body: "", footer: "" };

export default function TemplateCreateForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not submit template.");
      setNotice(data.message || "Template submitted to Meta.");
      setForm(initial);
      await onCreated?.();
    } catch (err) {
      setError(err.message || "Could not submit template.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-green-500";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Create a template</h2>
          <p className="mt-1 text-xs text-slate-500">Submit a simple text template to Meta for approval.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
          {open ? <X size={16} /> : <Plus size={16} />}
          {open ? "Close" : "New template"}
        </button>
      </div>

      {notice && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Template name
              <input required maxLength={512} pattern="[a-z0-9_]+" value={form.name} onChange={(e) => change("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="order_confirmation" className={field + " mt-1.5"} />
              <span className="mt-1 block text-xs font-normal text-slate-400">Lowercase letters, numbers, underscores.</span>
            </label>
            <label className="text-sm font-medium text-slate-700">Language
              <select value={form.language} onChange={(e) => change("language", e.target.value)} className={field + " mt-1.5"}>
                <option value="en_US">English (US)</option>
                <option value="en_GB">English (UK)</option>
                <option value="bn">Bengali</option>
                <option value="bn_BD">Bengali (Bangladesh)</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Category
              <select value={form.category} onChange={(e) => change("category", e.target.value)} className={field + " mt-1.5"}>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Header (optional)
            <input maxLength={60} value={form.header} onChange={(e) => change("header", e.target.value)} placeholder="Your order update" className={field + " mt-1.5"} />
          </label>
          <label className="block text-sm font-medium text-slate-700">Body
            <textarea required maxLength={1024} rows={5} value={form.body} onChange={(e) => change("body", e.target.value)} placeholder="Hello {{1}}, your order {{2}} is ready." className={field + " mt-1.5"} />
            <span className="mt-1 block text-xs font-normal text-slate-400">Use sequential variables: {"{{1}}"}, {"{{2}}"}, and so on. Maximum 1,024 characters.</span>
          </label>
          <label className="block text-sm font-medium text-slate-700">Footer (optional)
            <input maxLength={60} value={form.footer} onChange={(e) => change("footer", e.target.value)} placeholder="Thank you for choosing us." className={field + " mt-1.5"} />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Meta reviews submitted templates. Approval is not guaranteed.</p>
            <button type="submit" disabled={busy || !form.name.trim() || !form.body.trim()} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" />}
              Submit for approval
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
