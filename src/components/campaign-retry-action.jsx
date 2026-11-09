"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showConfirm } from "@/lib/swal";

export default function CampaignRetryAction({ campaignId, initialStatus, initialFailedCount, initialCompletedAt }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [failedCount, setFailedCount] = useState(initialFailedCount || 0);
  const [completedAt, setCompletedAt] = useState(initialCompletedAt || null);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/campaigns/" + campaignId + "/progress", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success || !active) return;
        setStatus(data.campaign.status);
        setFailedCount(data.counts.failed || 0);
        setCompletedAt(data.campaign.completedAt || null);
      } catch {
        // The main progress panel reports refresh errors; keep this control quiet.
      } finally {
        inFlight = false;
      }
    }

    const isActive = ["queued", "sending"].includes(status);
    const completionTime = completedAt ? new Date(completedAt).getTime() : Number.NaN;
    const watchRecentCompletion = ["completed", "completed_with_issues"].includes(status)
      && Number.isFinite(completionTime)
      && Date.now() - completionTime < 10 * 60 * 1000;
    const pollInterval = isActive ? 5000 : watchRecentCompletion ? 15000 : null;

    if (pollInterval) {
      refresh();
      const timer = setInterval(refresh, pollInterval);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }

    return () => {
      active = false;
    };
  }, [campaignId, status, completedAt]);

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
      setStatus(data.status || "queued");
      setFailedCount(0);
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not retry failed recipients.");
    } finally {
      setLoading(false);
    }
  }

  if (status !== "completed_with_issues" || failedCount < 1) return null;

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
