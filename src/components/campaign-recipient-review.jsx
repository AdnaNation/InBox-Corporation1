"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CampaignRecipientReview({ campaignId, recipientId }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function review(outcome) {
    const label = outcome === "delivered" ? "confirmed delivered" : "confirmed not delivered";
    const note = window.prompt(
      "Explain why this recipient is " + label + ". This note is saved in the audit record (5–500 characters).",
    );
    if (note === null) return;
    if (note.trim().length < 5 || note.trim().length > 500) {
      setError("Please enter a review note between 5 and 500 characters.");
      return;
    }

    if (!window.confirm(
      "Save this recipient as " + label + "? This does not send or retry any WhatsApp message.",
    )) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/campaigns/" + campaignId + "/recipients/" + recipientId + "/review",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome, note: note.trim() }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not save review.");
      }
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not save review.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-64 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => review("delivered")}
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
        >
          Confirm delivered
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => review("failed")}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
        >
          Confirm not delivered
        </button>
      </div>
      {loading && <p className="text-xs text-slate-500">Saving review…</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
