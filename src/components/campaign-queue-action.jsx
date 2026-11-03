"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CampaignQueueAction({ campaignId, initialStatus, recipientCount }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function queueCampaign() {
    const confirmed = window.confirm(
      "Queue this campaign for " + recipientCount + " opted-in recipient(s)? Queueing does not send immediately, but makes it eligible for the delivery worker.",
    );
    if (!confirmed) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/campaigns/" + campaignId + "/queue", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not queue this campaign.");
      setMessage(data.message || "Campaign queued.");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not queue this campaign.");
    } finally {
      setLoading(false);
    }
  }

  if (initialStatus !== "draft") {
    return (
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-700">
          {initialStatus === "queued" ? "This campaign is queued and waiting for the delivery worker." : "Queue preparation is available only for draft campaigns."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Queue campaign</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        This checks the template with Meta again and validates the saved parameters. It does not send messages. Once queued, the campaign will be eligible for a separately protected delivery worker.
      </p>
      <button type="button" onClick={queueCampaign} disabled={loading || recipientCount < 1} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "Validating..." : "Validate and queue · " + recipientCount + " recipients"}
      </button>
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
