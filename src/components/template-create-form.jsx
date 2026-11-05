"use client";

import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";

const initial = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  templateType: "STANDARD",
  couponExample: "SAVE20",
  offerText: "Expiring offer!",
  header: "",
  headerFormat: "TEXT",
  headerMediaHandle: "",
  headerMediaName: "",
  body: "",
  bodyExamples: {},
  footer: "",
  buttonGroup: "QUICK_REPLY",
  buttons: [],
};

function renderWhatsAppText(value) {
  const parts = String(value || "").split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[\s\S]+?```)/g);
  return parts.map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return <strong key={index}>{part.slice(1, -1)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("~") && part.endsWith("~")) {
      return <s key={index}>{part.slice(1, -1)}</s>;
    }
    if (part.startsWith("```") && part.endsWith("```")) {
      return <code key={index} className="rounded bg-slate-100 px-1 font-mono text-[0.9em]">{part.slice(3, -3)}</code>;
    }
    return part;
  });
}

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

  function changeTemplateType(templateType) {
    setForm((current) => ({
      ...current,
      templateType,
      category: templateType === "STANDARD" ? "UTILITY" : "MARKETING",
      footer: templateType === "STANDARD" ? current.footer : "",
      header: "",
      headerFormat: templateType === "STANDARD" ? "TEXT" : "NONE",
      headerMediaHandle: "",
      headerMediaName: "",
      buttonGroup: templateType === "LIMITED_TIME_OFFER" ? "CALL_TO_ACTION" : "QUICK_REPLY",
      buttons: templateType === "LIMITED_TIME_OFFER"
        ? [{ type: "URL", text: "Shop now", url: "https://example.com/offers", dynamic: false, example: "" }]
        : [],
    }));
    setMediaPreviewUrl("");
    setError("");
  }

  const bodyVariableNumbers = [...new Set(
    [...form.body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
  )].sort((a, b) => a - b);

  function updateButton(index, key, value) {
    setForm((current) => ({
      ...current,
      buttons: current.buttons.map((button, buttonIndex) =>
        buttonIndex === index ? { ...button, [key]: value } : button,
      ),
    }));
  }

  function addButton() {
    const limit = form.buttonGroup === "QUICK_REPLY" ? 3 : 2;
    if (form.buttons.length >= limit) return;
    change("buttons", [
      ...form.buttons,
      form.buttonGroup === "QUICK_REPLY"
        ? { type: "QUICK_REPLY", text: "" }
        : { type: "URL", text: "", url: "", dynamic: false, example: "" },
    ]);
  }

  async function uploadHeaderMedia(file) {
    if (!file) return;
    const limits = { IMAGE: 5 * 1024 * 1024, VIDEO: 16 * 1024 * 1024, DOCUMENT: 100 * 1024 * 1024 };
    const allowed = { IMAGE: ["image/jpeg", "image/png"], VIDEO: ["video/mp4"], DOCUMENT: ["application/pdf"] };
    if (!allowed[form.headerFormat]?.includes(file.type) || file.size > limits[form.headerFormat]) {
      setError("Choose a supported file: JPEG/PNG (5 MB), MP4 (16 MB), or PDF (100 MB).");
      return;
    }
    change("headerMediaHandle", ""); change("headerMediaName", ""); setMediaPreviewUrl("");
    setMediaBusy(true); setError("");
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
        buttons: form.buttons,
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
  const buttonsValid = form.buttons.every((button) => {
    if (!button.text?.trim() || button.text.trim().length > 25) return false;
    if (button.type === "URL") {
      if (!button.url?.trim()) return false;
      if (button.dynamic && (!/\{\{1\}\}$/.test(button.url.trim()) || !button.example?.trim())) return false;
      if (!button.dynamic && /\{\{\d+\}\}/.test(button.url)) return false;
    }
    if (button.type === "PHONE_NUMBER" && !/^\+[1-9]\d{7,14}$/.test(button.phone_number || "")) return false;
    return true;
  });
  const buttonLimit = form.buttonGroup === "QUICK_REPLY" ? 3 : 2;
  const specialTemplate = form.templateType !== "STANDARD";
  const couponCodeLimit = form.templateType === "LIMITED_TIME_OFFER" ? 15 : 20;
  const canSubmit = !mediaBusy && form.name.trim() && form.body.trim() &&
    (form.headerFormat === "NONE" || form.headerFormat === "TEXT" || form.headerMediaHandle) &&
    form.couponExample.trim().length > 0 && form.couponExample.trim().length <= couponCodeLimit &&
    (form.templateType !== "LIMITED_TIME_OFFER" || (form.offerText.trim().length > 0 && form.offerText.trim().length <= 16 && form.buttons.length === 1 && form.buttons[0]?.type === "URL" && !form.buttons[0]?.dynamic)) &&
    (form.templateType === "STANDARD" ? form.buttons.length <= buttonLimit && buttonsValid : form.templateType === "LIMITED_TIME_OFFER" ? buttonsValid : true);

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
          <label className="block text-sm font-medium text-slate-700">Template type
            <select value={form.templateType} onChange={(event) => changeTemplateType(event.target.value)} className={field + " mt-1.5"}>
              <option value="STANDARD">Standard template</option>
              <option value="COUPON_CODE">Coupon code</option>
              <option value="LIMITED_TIME_OFFER">Limited-time offer</option>
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">Coupon and limited-time offer templates are Marketing templates.</span>
          </label>
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
              <select value={form.category} disabled={specialTemplate} onChange={(e) => change("category", e.target.value)} className={field + " mt-1.5 disabled:bg-slate-100 disabled:text-slate-500"}>
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
              </select>
            </label>
          </div>
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-semibold text-slate-800">Header (optional)</label>
              <select value={form.headerFormat} onChange={(e) => { change("headerFormat", e.target.value); change("headerMediaHandle", ""); change("headerMediaName", ""); setMediaPreviewUrl(""); }} className={field + " max-w-44"}>
                <option value="NONE">No header</option>
                {form.templateType === "STANDARD" && <><option value="TEXT">Text</option><option value="DOCUMENT">Document (PDF)</option></>}
                {form.templateType === "STANDARD" && <><option value="IMAGE">Image</option><option value="VIDEO">Video</option></> }
              </select>
            </div>
            {form.headerFormat === "NONE" ? (
              <p className="mt-3 text-xs text-slate-500">No header will be included.</p>
            ) : form.headerFormat === "TEXT" ? (
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
            <textarea required maxLength={form.templateType === "LIMITED_TIME_OFFER" ? 600 : 1024} rows={5} value={form.body} onChange={(e) => change("body", e.target.value)} placeholder="Hello {{1}}, your order {{2}} is ready." className={field + " mt-1.5"} />
            <span className="mt-1 block text-xs font-normal text-slate-400">Use sequential variables: {"{{1}}"}, {"{{2}}"}, and so on. Formatting: *bold*, _italic_, ~strikethrough~, and ```monospace```. {form.templateType === "LIMITED_TIME_OFFER" ? "Maximum 600 characters for limited-time offers." : "Maximum 1,024 characters."}</span>
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
          {form.templateType !== "STANDARD" && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Copy-code button</h3>
              <p className="mt-1 text-xs text-slate-600">WhatsApp supplies the button label automatically. Enter an example code for Meta template review; the real code is supplied when you send the message.</p>
              <input required maxLength={couponCodeLimit} value={form.couponExample} onChange={(event) => change("couponExample", event.target.value.replace(/\\s/g, "").slice(0, couponCodeLimit))} placeholder="SAVE20" className={field + " mt-3"} />
              <p className="mt-1 text-xs text-slate-500">Maximum {couponCodeLimit} characters.</p>
            </section>
          )}
          {form.templateType === "LIMITED_TIME_OFFER" && (
            <label className="block text-sm font-medium text-slate-700">Offer label
              <input required maxLength={16} value={form.offerText} onChange={(event) => change("offerText", event.target.value)} placeholder="Expiring offer!" className={field + " mt-1.5"} />
              <span className="mt-1 block text-xs font-normal text-slate-500">Up to 16 characters. Meta displays its own countdown when the message is sent.</span>
            </label>
          )}
          {form.templateType === "STANDARD" && <label className="block text-sm font-medium text-slate-700">Footer (optional)
            <input maxLength={60} value={form.footer} onChange={(e) => change("footer", e.target.value)} placeholder="Thank you for choosing us." className={field + " mt-1.5"} />
          </label>}

          {form.templateType !== "COUPON_CODE" && <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Template buttons (optional)</h3>
                <p className="mt-1 text-xs text-slate-500">{form.templateType === "LIMITED_TIME_OFFER" ? "Limited-time offers require one static website URL button after the copy-code button." : "Choose up to 3 quick replies, or up to 2 call-to-action buttons."}</p>
              </div>
              {form.templateType === "STANDARD" && <select value={form.buttonGroup} onChange={(event) => setForm((current) => ({ ...current, buttonGroup: event.target.value, buttons: [] }))} className={field + " max-w-48"}>
                <option value="QUICK_REPLY">Quick replies</option>
                <option value="CALL_TO_ACTION">Call-to-action</option>
              </select>}
            </div>
            <div className="mt-3 space-y-3">
              {form.buttons.map((button, index) => (
                <div key={index} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-600">Button {index + 1}</p>
                    {form.templateType !== "LIMITED_TIME_OFFER" && <button type="button" onClick={() => change("buttons", form.buttons.filter((_, buttonIndex) => buttonIndex !== index))} className="text-xs font-medium text-red-600">Remove</button>}
                  </div>
                  {form.buttonGroup === "CALL_TO_ACTION" && (
                    <label className="mb-3 block text-xs font-medium text-slate-600">Button type
                      <select value={button.type} onChange={(event) => updateButton(index, "type", event.target.value)} className={field + " mt-1.5"}>
                        <option value="URL">Website URL</option>
                        {form.templateType === "STANDARD" && <option value="PHONE_NUMBER">Call phone number</option>}
                      </select>
                    </label>
                  )}
                  {button.type !== "COPY_CODE" && (
                    <label className="block text-xs font-medium text-slate-600">Button label
                      <input required maxLength={25} value={button.text || ""} onChange={(event) => updateButton(index, "text", event.target.value)} placeholder={button.type === "QUICK_REPLY" ? "Yes, confirm" : button.type === "PHONE_NUMBER" ? "Call us" : "View details"} className={field + " mt-1.5"} />
                    </label>
                  )}
                  {button.type === "URL" && (
                    <div className="mt-3 space-y-3">
                      <label className="block text-xs font-medium text-slate-600">Website URL
                        <input required value={button.url || ""} onChange={(event) => updateButton(index, "url", event.target.value)} placeholder="https://example.com/orders/{{1}}" className={field + " mt-1.5"} />
                      </label>
                      {form.templateType === "STANDARD" && <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={Boolean(button.dynamic)} onChange={(event) => updateButton(index, "dynamic", event.target.checked)} className="accent-green-600" />
                        Dynamic URL (ends with {"{{1}}"})
                      </label>
                      {form.templateType === "STANDARD" && button.dynamic && (
                        <label className="block text-xs font-medium text-slate-600">Example value for {"{{1}}"}
                          <input required value={button.example || ""} onChange={(event) => updateButton(index, "example", event.target.value)} placeholder="10" className={field + " mt-1.5"} />
                        </label>
                      )}}
                    </div>
                  )}
                  {form.templateType === "STANDARD" && button.type === "PHONE_NUMBER" && (
                    <label className="mt-3 block text-xs font-medium text-slate-600">Phone number (international format)
                      <input required value={button.phone_number || ""} onChange={(event) => updateButton(index, "phone_number", event.target.value.replace(/[^+\d]/g, ""))} placeholder="+8801XXXXXXXXX" className={field + " mt-1.5"} />
                      <span className="mt-1 block font-normal text-slate-400">Include country code, starting with +.</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
            {form.templateType === "LIMITED_TIME_OFFER" ? null : form.buttons.length < buttonLimit && (
              <button type="button" onClick={addButton} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50">
                <Plus size={14} /> Add {form.buttonGroup === "QUICK_REPLY" ? "quick reply" : "call-to-action"} button
              </button>
            )}
            {form.buttons.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Quick replies cannot be mixed with call-to-action buttons in one template.</p>}
          </section>}

          </div>
          <aside className="xl:sticky xl:top-5 xl:self-start">
            <div className="rounded-2xl border border-slate-200 bg-[#efeae2] p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Live WhatsApp preview</h3>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                {form.headerFormat === "TEXT" && form.header && <p className="mb-2 text-sm font-bold text-slate-900">{form.header}</p>}
                {form.headerFormat === "IMAGE" && mediaPreviewUrl && <img src={mediaPreviewUrl} alt="Header preview" className="mb-2 max-h-48 w-full rounded-lg object-cover" />}
                {form.headerFormat === "VIDEO" && mediaPreviewUrl && <video src={mediaPreviewUrl} controls className="mb-2 max-h-48 w-full rounded-lg" />}
                {form.headerFormat === "DOCUMENT" && form.headerMediaName && <p className="mb-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-700">📄 {form.headerMediaName}</p>}
                {form.headerFormat !== "TEXT" && form.headerFormat !== "NONE" && !mediaPreviewUrl && <p className="mb-2 rounded-lg bg-slate-100 p-6 text-center text-xs text-slate-400">{form.headerFormat} header preview</p>}
                <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{renderWhatsAppText(previewBody || "Your message will appear here…")}</p>
                {form.templateType === "LIMITED_TIME_OFFER" && <p className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{form.offerText || "Expiring offer!"}</p>}
                {form.footer && <p className="mt-2 text-[11px] text-slate-500">{form.footer}</p>}
                {form.templateType !== "STANDARD" && <div className="mt-3 rounded-md border border-slate-100 py-2 text-center text-xs font-semibold text-blue-600">Copy code · {form.couponExample}</div>}
                {form.buttons.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                    {form.buttons.map((button, index) => (
                      <div key={index} className="rounded-md border border-slate-100 py-2 text-center text-xs font-semibold text-blue-600">
                        {button.text || (button.type === "PHONE_NUMBER" ? "Call" : button.type === "URL" ? "Website button" : "Quick reply")}
                        {button.type === "URL" && <span className="block break-all px-2 text-[10px] font-normal text-slate-400">{button.url?.replace(/\{\{1\}\}$/, button.example || "10")}</span>}
                        {button.type === "PHONE_NUMBER" && <span className="block text-[10px] font-normal text-slate-400">{button.phone_number}</span>}
                      </div>
                    ))}
                  </div>
                )}
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
