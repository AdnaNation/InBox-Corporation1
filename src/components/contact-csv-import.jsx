"use client";

import { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  Download,
  CheckCircle,
} from "lucide-react";

export default function ContactCsvImport({ onImported }) {
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function importContacts(event) {
    event.preventDefault();

    if (!file) {
      setError("Please select a CSV file.");
      return;
    }

    if (!consentConfirmed) {
      setError("Please confirm contact consent before importing.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("consentConfirmed", "true");

      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Import failed.");
        return;
      }

      setResult(data);
      setFile(null);

      if (fileInput.current) {
        fileInput.current.value = "";
      }

      if (onImported) {
        await onImported();
      }
    } catch (error) {
      console.error(error);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() {
    const csv = "name,phone\nJohn Doe,+8801712345678\nJane Doe,+8801812345678";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "wavo-contacts-template.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-50 p-3 text-green-600">
            <FileSpreadsheet size={21} />
          </div>

          <div>
            <h2 className="font-semibold">Import contacts from CSV</h2>
            <p className="mt-1 text-xs text-slate-500">
              Upload up to 500 contacts at once.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50"
        >
          <Download size={15} />
          Download template
        </button>
      </div>

      <form onSubmit={importContacts}>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center hover:border-green-400">
          <Upload className="mb-3 text-green-600" size={25} />

          <span className="text-sm font-semibold">
            {file ? file.name : "Choose a CSV file"}
          </span>

          <span className="mt-1 text-xs text-slate-400">
            CSV only · Maximum 2 MB
          </span>

          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setError("");
              setResult(null);
            }}
          />
        </label>

        <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-600">
          <input
            type="checkbox"
            checked={consentConfirmed}
            onChange={(event) => setConsentConfirmed(event.target.checked)}
            className="mt-1 accent-green-600"
          />

          <span>
            I confirm that every contact in this file has explicitly agreed to
            receive WhatsApp messages from this business.
          </span>
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {result && (
          <div className="mt-3 rounded-xl bg-green-50 p-4 text-sm text-green-800">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <CheckCircle size={17} />
              Import completed
            </div>

            <p>Added: {result.added}</p>
            <p>Duplicates skipped: {result.duplicates}</p>
            <p>Invalid rows: {result.invalid?.length || 0}</p>

            {result.invalid?.length > 0 && (
              <div className="mt-3 border-t border-green-200 pt-3">
                <p className="mb-2 font-semibold">Rows that need attention</p>

                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {result.invalid.map((item) => (
                    <p key={item.row}>
                      Row {item.row}: {item.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !file || !consentConfirmed}
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Upload size={17} />
          )}

          {loading ? "Importing..." : "Import contacts"}
        </button>
      </form>
    </section>
  );
}
