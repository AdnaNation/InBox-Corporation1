"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showConfirm } from "@/lib/swal";

export default function CampaignRetryAction({ campaignId, failedCount }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function retryFailed() {
    const confirmed = await showConfirm({
      title: "Retry failed recipients?",
      text: "Retry only " + failedCount + " failed recipient(s)? Recipients already accepted, delivered, read, skipped, or marked unknown will not be resent.",
      confirmButtonText: "Retry failed",
    });
    if (!confirmed) return;

    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/campaigns/" + campaignId + "/retry-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not retry failed recipients.");
      setMessage(data.message || "Failed recipients queued.");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not retry failed recipients.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Retry failed recipients</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Only recipients with a definite failed status are retried. Meta template approval is checked again first. Previously accepted or uncertain sends are never automatically repeated.
          </p>
        </div>
        <button
          type="button"
          onClick={retryFailed}
          disabled={loading || failedCount < 1}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Checking with Meta..." : "Retry failed · " + failedCount}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
