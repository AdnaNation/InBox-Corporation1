"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TemplateCreateForm from "./template-create-form";
import { showConfirm } from "@/lib/swal";
import {
  RefreshCw,
  FileText,
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertCircle,
  Copy,
  Pencil,
  X,
  Save,
  Trash2,
} from "lucide-react";

const statusStyles = {
  APPROVED: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  PAUSED: "bg-orange-50 text-orange-700",
  DISABLED: "bg-slate-100 text-slate-600",
};

function StatusIcon({ status }) {
  if (status === "APPROVED") return <CheckCircle2 size={15} />;
  if (status === "PENDING") return <Clock3 size={15} />;
  if (status === "REJECTED") return <XCircle size={15} />;

  return <AlertCircle size={15} />;
}

function renderWhatsAppText(value) {
  const parts = String(value || "").split(/(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
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
      return <code key={index} className="rounded bg-slate-200 px-1 font-mono text-[0.9em]">{part.slice(3, -3)}</code>;
    }
    return part;
  });
}

function TemplateCard({ template, onEdit, onDelete, deleting }) {
  const [copyState, setCopyState] = useState("idle");
  const components = template.components || [];

  const header = components.find((item) => item.type === "HEADER");
  const body = components.find((item) => item.type === "BODY");
  const footer = components.find((item) => item.type === "FOOTER");
  const buttons = components.find((item) => item.type === "BUTTONS");
  const offer = components.find((item) => item.type === "LIMITED_TIME_OFFER");

  const variables = [
    ...new Set((body?.text || "").match(/\{\{\d+\}\}/g) || []),
  ];

  async function copyName() {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(template.name);
      } else {
        const field = document.createElement("textarea");
        field.value = template.name;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(field);
        if (!copied) throw new Error("Clipboard access was blocked by the browser.");
      }
      setCopyState("copied");
    } catch (error) {
      console.error("Copy template name failed:", error);
      setCopyState("error");
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-green-600" />

            <h3 className="break-all font-semibold text-slate-900">
              {template.name}
            </h3>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {template.language} · {template.category || "Uncategorized"}
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            statusStyles[template.status] || "bg-slate-100 text-slate-600"
          }`}
        >
          <StatusIcon status={template.status} />
          {template.status || "UNKNOWN"}
        </span>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {header && (
          <div className="mb-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Header
            </p>

            <p className="text-sm font-semibold text-slate-800">
              {header.text || header.format || "Media header"}
            </p>
          </div>
        )}

        {offer && (
          <div className="mb-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {offer.limited_time_offer?.text || "Limited-time offer"} · Countdown enabled
          </div>
        )}

        {body && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Body
            </p>

            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {renderWhatsAppText(body.text || "No body text available.")}
            </p>
          </div>
        )}

        {footer && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500">{footer.text}</p>
          </div>
        )}

        {buttons?.buttons?.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
            {buttons.buttons.map((button, index) => (
              <p
                key={index}
                className="rounded-lg bg-white px-3 py-2 text-center text-xs font-medium text-green-700"
              >
                {button.text || (String(button.type).toUpperCase() === "COPY_CODE" ? "Copy code" : button.type)}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {variables.length > 0 ? (
            <span>
              {variables.length} variable
              {variables.length > 1 ? "s" : ""}: {variables.join(", ")}
            </span>
          ) : (
            "No body variables"
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {["APPROVED", "REJECTED", "PAUSED"].includes(template.status) && (
            <button type="button" onClick={() => onEdit(template)} className="inline-flex items-center gap-2 rounded-lg border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50">
              <Pencil size={14} /> Edit template
            </button>
          )}
          <button type="button" onClick={copyName} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50" aria-live="polite">
            <Copy size={14} /> {copyState === "copied" ? "Copied!" : copyState === "error" ? "Copy failed — retry" : "Copy name"}
          </button>
          {template.status !== "DISABLED" && (
            <button type="button" onClick={() => onDelete(template)} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[11px] text-slate-400">
          Meta Template ID: {template.id || "—"}
        </p>

        <p className="mt-1 text-[11px] text-slate-400">
          Parameter format: {template.parameter_format || "—"}
        </p>
        {template.quality_score?.score && <p className="mt-1 text-[11px] text-slate-400">Quality: {template.quality_score.score}</p>}
        {template.rejected_reason && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">Meta feedback: {template.rejected_reason}</p>}
      </div>
    </article>
  );
}

export default function TemplateLibraryClient() {
  const [templates, setTemplates] = useState([]);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [componentsDraft, setComponentsDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingTemplateId, setDeletingTemplateId] = useState("");
  const [deleteError, setDeleteError] = useState("");

  function startEditing(template) {
    setEditingTemplate(template);
    setComponentsDraft(JSON.stringify(template.components || [], null, 2));
    setEditError("");
  }

  async function deleteTemplate(template) {
    const confirmed = await showConfirm({
      title: "Delete this template language?",
      text: `Delete "${template.name}" (${template.language}) from this WhatsApp Business Account? Only this language version will be removed. This action cannot be undone.`,
      confirmButtonText: "Delete template",
    });
    if (!confirmed) return;

    setDeletingTemplateId(template.id);
    setDeleteError("");
    try {
      const response = await fetch("/api/whatsapp/templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, name: template.name }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not delete template.");
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      if (editingTemplate?.id === template.id) setEditingTemplate(null);
    } catch (err) {
      setDeleteError(err.message || "Could not delete template.");
    } finally {
      setDeletingTemplateId("");
    }
  }

  async function saveTemplateEdit(event) {
    event.preventDefault();
    setSavingEdit(true);
    setEditError("");
    try {
      let components;
      try { components = JSON.parse(componentsDraft); } catch { throw new Error("The components must be valid JSON."); }
      if (!Array.isArray(components) || components.length === 0) throw new Error("Provide the complete components array.");
      const response = await fetch("/api/whatsapp/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: editingTemplate.id, components }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not update template.");
      setEditingTemplate(null);
      await loadTemplates();
    } catch (err) {
      setEditError(err.message || "Could not update template.");
    } finally {
      setSavingEdit(false);
    }
  }

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/whatsapp/templates", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not load templates.");
      }

      setTemplates(data.templates || []);
      setAccount(data.account || null);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const matchesSearch =
        template.name?.toLowerCase().includes(search.toLowerCase()) ||
        template.components?.some((component) =>
          component.text?.toLowerCase().includes(search.toLowerCase()),
        );

      const matchesStatus =
        statusFilter === "ALL" || template.status === statusFilter;

      const matchesCategory =
        categoryFilter === "ALL" || template.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [templates, search, statusFilter, categoryFilter]);

  const approved = templates.filter(
    (item) => item.status === "APPROVED",
  ).length;

  const pending = templates.filter((item) => item.status === "PENDING").length;

  const rejected = templates.filter(
    (item) => item.status === "REJECTED",
  ).length;

  return (
    <div className="space-y-6">
      {account && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-green-700">
            Connected WhatsApp Business Account
          </p>

          <h2 className="mt-1 text-lg font-semibold text-green-900">
            {account.businessName}
          </h2>

          <p className="mt-1 text-sm text-green-800">
            {account.displayPhoneNumber}
          </p>
        </section>
      )}

      {account && <TemplateCreateForm onCreated={loadTemplates} />}

      {deleteError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {editingTemplate && (
        <section className="rounded-2xl border border-green-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Edit {editingTemplate.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{editingTemplate.language} · {editingTemplate.status} · Meta ID: {editingTemplate.id}</p>
            </div>
            <button type="button" onClick={() => setEditingTemplate(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close editor"><X size={18} /></button>
          </div>
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            Meta replaces the entire components array during an edit. Keep every header, body, footer, button, example, and other component you want to retain. Template name, language, and category are not changed. Approved templates can be edited once in 24 hours and up to 10 times in 30 days. Rejected and paused templates have different limits. Meta checks the live status before accepting an edit.
          </div>
          <form onSubmit={saveTemplateEdit} className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">Complete template components (JSON)
              <textarea required spellCheck={false} rows={16} value={componentsDraft} onChange={(event) => setComponentsDraft(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-100 outline-none focus:border-green-500" />
            </label>
            <p className="text-xs text-slate-500">Advanced components are preserved in this editor, including quick replies, phone buttons, dynamic URL buttons, and Meta-specific structures.</p>
            {editError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditingTemplate(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
              <button type="submit" disabled={savingEdit} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} /> {savingEdit ? "Submitting…" : "Submit update to Meta"}</button>
            </div>
          </form>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total templates</p>
          <p className="mt-2 text-3xl font-bold">{templates.length}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Approved</p>
          <p className="mt-2 text-3xl font-bold text-green-600">{approved}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Pending review</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{pending}</p>
        </div>
      </div>

      {rejected > 0 && (
        <p className="text-sm text-red-600">
          {rejected} template(s) rejected by Meta.
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-slate-900">Template library</h2>

            <p className="mt-1 text-xs text-slate-500">
              Templates are synchronized directly from Meta.
            </p>
          </div>

          <button
            type="button"
            onClick={loadTemplates}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh templates
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full rounded-xl border border-slate-200 py-3 pl-9 pr-3 text-sm outline-none focus:border-green-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-green-500"
          >
            <option value="ALL">All statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
            <option value="PAUSED">Paused</option>
            <option value="DISABLED">Disabled</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-green-500"
          >
            <option value="ALL">All categories</option>
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>
        </div>

        {error && (
          <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Loading templates from Meta...
          </div>
        ) : filteredTemplates.length > 0 ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={startEditing}
                onDelete={deleteTemplate}
                deleting={deletingTemplateId === template.id}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <FileText size={32} className="mx-auto text-slate-300" />

            <p className="mt-3 font-medium text-slate-700">
              No templates found
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Try another filter or create a template in WhatsApp Manager.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
