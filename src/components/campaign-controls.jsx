"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showConfirm } from "@/lib/swal";

export default function CampaignControls({ campaignId, initialStatus, canManage = false }) {
  if (!canManage) return null;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canPause = ["queued", "sending"].includes(initialStatus);
  const canResume = initialStatus === "paused";

  async function changeStatus(action) {
    const prompt = action === "pause"
      ? "Pause this campaign? A message already being sent may still finish."
      : "Resume this campaign? Only recipients still pending or due for retry will be processed.";
    if (!(await showConfirm({ title: action === "pause" ? "Pause campaign?" : "Resume campaign?", text: prompt, confirmButtonText: action === "pause" ? "Pause campaign" : "Resume campaign" }))) return;

    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/campaigns/" + campaignId + "/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not update campaign.");
      setMessage(data.message);
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not update campaign.");
    } finally {
      setLoading(false);
    }
  }

  if (!canPause && !canResume) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Campaign controls</h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {canPause
              ? "Pausing prevents the worker from claiming new recipients. A request already in flight may complete."
              : "Resume returns the campaign to the queue. Previously accepted, failed, skipped and unknown recipients are not resent."}
          </p>
        </div>
        {canPause ? (
          <button type="button" onClick={() => changeStatus("pause")} disabled={loading} className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">
            {loading ? "Please wait..." : "Pause campaign"}
          </button>
        ) : (
          <button type="button" onClick={() => changeStatus("resume")} disabled={loading} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50">
            {loading ? "Please wait..." : "Resume campaign"}
          </button>
        )}
      </div>
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
