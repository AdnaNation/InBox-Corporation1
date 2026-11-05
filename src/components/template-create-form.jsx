"use client";

import { useState } from "react";
import { Plus, Loader2, X, Link2 } from "lucide-react";

const initial = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  header: "",
  headerFormat: "TEXT",
  headerMediaHandle: "",
  headerMediaName: "",
  body: "",
  bodyExamples: {},
  footer: "",
  addUrlButton: false,
  buttonText: "View details",
  buttonUrl: "",
  buttonMode: "static",
};

export default function TemplateCreateForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const previewBody = form.body.replace(/\{\{(\d+)\}\}/g, (_, number) => form.bodyExamples[number] || `{{${number}}}`);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const bodyVariableNumbers = [...new Set(
    [...form.body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
  )].sort((a, b) => a - b);

  async function uploadHeaderMedia(file) {
    if (!file) return;
    const limits = { IMAGE: 5 * 1024 * 1024, VIDEO: 16 * 1024 * 1024, DOCUMENT: 100 * 1024 * 1024 };
    const allowed = { IMAGE: ["image/jpeg", "image/png"], VIDEO: ["video/mp4"], DOCUMENT: ["application/pdf"] };
    if (!allowed[form.headerFormat]?.includes(file.type) || file.size > limits[form.headerFormat]) {
      setError("Choose a supported file: JPEG/PNG (5 MB), MP4 (16 MB), or PDF (100 MB).");
      return;
    }
    change("headerMediaHandle", ""); change("headerMediaName", ""); setMediaPreviewUrl("");\n    setMediaBusy(true); setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("format", form.headerFormat);
      const response = await fetch("/api/whatsapp/templates/upload-media", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Media upload failed.");
      change("headerMediaHandle", result.handle);
      change("headerMediaName", file.name);
      setMediaPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err.message || "Media upload failed.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        button: form.addUrlButton
          ? {
              type: "URL",
              text: form.buttonText,
              url: form.buttonUrl,
              dynamic: form.buttonMode === "dynamic",
              example: form.buttonExample,
            }
          : null,
      };
      const response = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
  const dynamicUrlValid = form.buttonMode !== "dynamic" || /\{\{1\}\}$/.test(form.buttonUrl.trim());
  const canSubmit = form.name.trim() && form.body.trim() && (form.headerFormat === "TEXT" || form.headerMediaHandle) &&
    (!form.addUrlButton || (form.buttonText.trim() && form.buttonUrl.trim() && dynamicUrlValid));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Create a template</h2>
          <p className="mt-1 text-xs text-slate-500">Build a text or media template with a live WhatsApp preview, then submit it to Meta for approval.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700">
          {open ? <X size={16} /> : <Plus size={16} />}
          {open ? "Close" : "New template"}
        </button>
      </div>

      {notice && <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {open && (
        <form onSubmit={submit} className="mt-5 border-t border-slate-100 pt-5"><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="min-w-0 space-y-4">
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
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-semibold text-slate-800">Header (optional)</label>
              <select value={form.headerFormat} onChange={(e) => { change("headerFormat", e.target.value); change("headerMediaHandle", ""); change("headerMediaName", ""); setMediaPreviewUrl(""); }} className={field + " max-w-44"}>
                <option value="TEXT">Text</option><option value="IMAGE">Image</option><option value="VIDEO">Video</option><option value="DOCUMENT">Document (PDF)</option>
              </select>
            </div>
            {form.headerFormat === "TEXT" ? (
              <input maxLength={60} value={form.header} onChange={(e) => change("header", e.target.value)} placeholder="Your order update" className={field + " mt-3"} />
            ) : (
              <div className="mt-3">
                <input type="file" accept={form.headerFormat === "IMAGE" ? "image/jpeg,image/png" : form.headerFormat === "VIDEO" ? "video/mp4" : "application/pdf"} onChange={(e) => uploadHeaderMedia(e.target.files?.[0])} className="block w-full text-sm text-slate-600" />
                <p className="mt-1 text-xs text-slate-500">Upload a sample file for Meta template review. JPEG/PNG up to 5 MB, MP4 up to 16 MB, PDF up to 100 MB.</p>
                {mediaBusy && <p className="mt-2 text-xs text-green-700">Uploading media to Meta…</p>}
                {form.headerMediaHandle && <p className="mt-2 text-xs text-green-700">Uploaded: {form.headerMediaName}</p>}
              </div>
            )}
          </section>
          <label className="block text-sm font-medium text-slate-700">Body
            <textarea required maxLength={1024} rows={5} value={form.body} onChange={(e) => change("body", e.target.value)} placeholder="Hello {{1}}, your order {{2}} is ready." className={field + " mt-1.5"} />
            <span className="mt-1 block text-xs font-normal text-slate-400">Use sequential variables: {"{{1}}"}, {"{{2}}"}, and so on. Maximum 1,024 characters.</span>
          </label>
          {bodyVariableNumbers.length > 0 && (
            <section className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Body variable examples for Meta</h3>
              <p className="mt-1 text-xs text-slate-500">Enter sample values Meta can use to review each placeholder. These are examples, not the values sent to customers.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {bodyVariableNumbers.map((number) => (
                  <label key={number} className="text-sm font-medium text-slate-700">
                    Example for {"{{"}{number}{"}}"}
                    <input
                      required
                      value={form.bodyExamples[number] || ""}
                      onChange={(event) => change("bodyExamples", { ...form.bodyExamples, [number]: event.target.value })}
                      placeholder={number === 1 ? "আদনান" : `Sample value ${number}`}
                      className={field + " mt-1.5"}
                    />
                  </label>
                ))}
              </div>
            </section>
          )}
          <label className="block text-sm font-medium text-slate-700">Footer (optional)
            <input maxLength={60} value={form.footer} onChange={(e) => change("footer", e.target.value)} placeholder="Thank you for choosing us." className={field + " mt-1.5"} />
          </label>

          <section className="rounded-xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={form.addUrlButton} onChange={(e) => change("addUrlButton", e.target.checked)} className="h-4 w-4 accent-green-600" />
              <Link2 size={16} className="text-green-600" />
              Add website URL button
            </label>
            {form.addUrlButton && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">Button text
                    <input required maxLength={25} value={form.buttonText} onChange={(e) => change("buttonText", e.target.value)} placeholder="View order" className={field + " mt-1.5"} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">URL type
                    <select value={form.buttonMode} onChange={(e) => change("buttonMode", e.target.value)} className={field + " mt-1.5"}>
                      <option value="static">Static URL</option>
                      <option value="dynamic">Dynamic URL (with variable)</option>
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700">Website URL
                  <input required type="text" inputMode="url" value={form.buttonUrl} onChange={(e) => change("buttonUrl", e.target.value)} placeholder={form.buttonMode === "dynamic" ? "https://example.com/orders/{{1}}" : "https://example.com/orders"} className={field + " mt-1.5"} />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    {form.buttonMode === "dynamic"
                      ? 'Add {{1}} at the end of the URL. Meta will review it as a dynamic link template; sending-time values will be handled in the messaging workflow.'
                      : "Enter the complete fixed HTTPS link."}
                  </span>
                </label>
                {form.buttonMode === "dynamic" && (
                  <label className="block text-sm font-medium text-slate-700">Button URL variable example for {"{{1}}"}
                    <input
                      required
                      value={form.buttonExample || ""}
                      onChange={(event) => change("buttonExample", event.target.value)}
                      placeholder="10"
                      className={field + " mt-1.5"}
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">For https://example.com/orders/{"{{1}}"}, enter 10. Meta will receive the complete example URL.</span>
                  </label>
                )}
                {form.buttonMode === "dynamic" && !dynamicUrlValid && (
                  <p className="text-xs text-amber-700">A dynamic URL must end with {"{{1}}"}.</p>
                )}
              </div>
            )}
          </section>

          </div>
          <aside className="xl:sticky xl:top-5 xl:self-start">
            <div className="rounded-2xl border border-slate-200 bg-[#efeae2] p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Live WhatsApp preview</h3>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                {form.headerFormat === "TEXT" && form.header && <p className="mb-2 text-sm font-bold text-slate-900">{form.header}</p>}
                {form.headerFormat === "IMAGE" && mediaPreviewUrl && <img src={mediaPreviewUrl} alt="Header preview" className="mb-2 max-h-48 w-full rounded-lg object-cover" />}
                {form.headerFormat === "VIDEO" && mediaPreviewUrl && <video src={mediaPreviewUrl} controls className="mb-2 max-h-48 w-full rounded-lg" />}
                {form.headerFormat === "DOCUMENT" && form.headerMediaName && <p className="mb-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-700">📄 {form.headerMediaName}</p>}
                {form.headerFormat !== "TEXT" && !mediaPreviewUrl && <p className="mb-2 rounded-lg bg-slate-100 p-6 text-center text-xs text-slate-400">{form.headerFormat} header preview</p>}
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{previewBody || "Your message will appear here…"}</p>
                {form.footer && <p className="mt-2 text-[11px] text-slate-500">{form.footer}</p>}
                {form.addUrlButton && <div className="mt-3 border-t border-slate-100 pt-2 text-center text-sm font-semibold text-blue-600">{form.buttonText || "Website button"}{form.buttonMode === "dynamic" && <span className="block break-all text-[10px] font-normal text-slate-400">{form.buttonUrl.replace(/\{\{1\}\}$/, form.buttonExample || "10")}</span>}</div>}
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-500">Sample preview; final rendering may vary in WhatsApp.</p>
            </div>
          </aside>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Meta reviews submitted templates. Approval is not guaranteed.</p>
            <button type="submit" disabled={busy || !canSubmit} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" />}
              Submit for approval
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
