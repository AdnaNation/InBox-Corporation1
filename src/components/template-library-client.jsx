"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TemplateCreateForm from "./template-create-form";
import {
  RefreshCw,
  FileText,
  Search,
  CheckCircle2,
  Clock3,
  XCircle,
  AlertCircle,
  Copy,
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

function TemplateCard({ template }) {
  const components = template.components || [];

  const header = components.find((item) => item.type === "HEADER");
  const body = components.find((item) => item.type === "BODY");
  const footer = components.find((item) => item.type === "FOOTER");
  const buttons = components.find((item) => item.type === "BUTTONS");

  const variables = [
    ...new Set((body?.text || "").match(/\{\{\d+\}\}/g) || []),
  ];

  async function copyName() {
    await navigator.clipboard.writeText(template.name);
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

        {body && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Body
            </p>

            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {body.text || "No body text available."}
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
                {button.text || button.type}
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

        <button
          type="button"
          onClick={copyName}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Copy size={14} />
          Copy name
        </button>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-[11px] text-slate-400">
          Meta Template ID: {template.id || "—"}
        </p>

        <p className="mt-1 text-[11px] text-slate-400">
          Parameter format: {template.parameter_format || "—"}
        </p>
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
              <TemplateCard key={template.id} template={template} />
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
