"use client";

import { useState } from "react";

export default function CampaignTemplateVerification({
  campaignId,
  initialVerification = "pending",
  initialMessage = "",
  initialMetaStatus = "",
}) {
  const [verification, setVerification] = useState(initialVerification);
  const [message, setMessage] = useState(initialMessage);
  const [metaStatus, setMetaStatus] = useState(initialMetaStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verifyTemplate = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/campaigns/${campaignId}/verify-template`,
        { method: "POST" },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Verification failed.");
      }

      setVerification(result.verification);
      setMessage(result.message || "");
      setMetaStatus(result.template?.status || "");
    } catch (err) {
      setError(err.message || "Could not verify the template.");
    } finally {
      setLoading(false);
    }
  };

  const approved = verification === "approved";

  const statusStyles = {
    approved: "bg-green-50 text-green-700 border-green-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    not_found: "bg-red-50 text-red-700 border-red-200",
    unavailable: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            Meta template verification
          </p>

          <span
            className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
              statusStyles[verification] ||
              "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {verification.replaceAll("_", " ")}
          </span>

          {metaStatus && (
            <p className="mt-2 text-xs text-slate-500">
              Meta status: {metaStatus}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={verifyTemplate}
          disabled={loading}
          className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Checking Meta..."
            : verification === "approved"
              ? "Verify again"
              : "Verify with Meta"}
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {approved && (
        <p className="mt-3 text-xs leading-5 text-green-700">
          The selected template is approved by Meta. Campaign approval and
          sending are still separate steps.
        </p>
      )}
    </div>
  );
}
