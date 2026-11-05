"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { showConfirm } from "@/lib/swal";

function localDateTimeValue(date) {
  const value = new Date(date);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function CampaignQueueAction({ campaignId, initialStatus, recipientCount, initialScheduledAt }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(initialScheduledAt ? localDateTimeValue(initialScheduledAt) : "");

  async function sendAction(url, payload, fallback) {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || fallback);
      setMessage(data.message || "Campaign updated.");
      setScheduleMode(false);
      router.refresh();
    } catch (err) {
      setError(err.message || fallback);
    } finally {
      setLoading(false);
    }
  }

  function toIso() {
    const value = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(value.getTime())) throw new Error("Choose a valid date and time.");
    return value.toISOString();
  }

  async function queueCampaign(schedule) {
    if (!(await showConfirm({
      title: schedule ? "Schedule campaign?" : "Queue campaign?",
      text: schedule
        ? "Validate and schedule this campaign for " + new Date(scheduledAt).toLocaleString() + "? No messages will be sent before that time."
        : "Queue this campaign for " + recipientCount + " opted-in recipient(s)? The delivery worker may start sending as soon as it runs.",
      confirmButtonText: schedule ? "Schedule campaign" : "Queue campaign",
    }))) return;
    try {
      await sendAction("/api/campaigns/" + campaignId + "/queue", schedule ? { scheduledAt: toIso() } : {}, "Could not queue this campaign.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateSchedule() {
    try {
      await sendAction("/api/campaigns/" + campaignId + "/control", { action: "reschedule", scheduledAt: toIso() }, "Could not update schedule.");
    } catch (err) {
      setError(err.message);
    }
  }

  if (initialStatus === "scheduled") {
    return (
      <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Scheduled delivery</h3>
        <p className="mt-1 text-sm text-slate-600">Scheduled for {initialScheduledAt ? new Date(initialScheduledAt).toLocaleString() : "—"}. The campaign will become eligible for delivery when the protected worker next runs after this time.</p>
        {scheduleMode ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">New send time
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" disabled={loading} onClick={updateSchedule} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? "Saving..." : "Save schedule"}</button>
            <button type="button" onClick={() => setScheduleMode(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Keep current</button>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setScheduleMode(true)} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800">Change time</button>
            <button type="button" disabled={loading} onClick={() => sendAction("/api/campaigns/" + campaignId + "/control", { action: "cancel_schedule" }, "Could not cancel schedule.")} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">{loading ? "Please wait..." : "Cancel schedule"}</button>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    );
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
      <h3 className="text-sm font-semibold text-slate-900">Queue or schedule campaign</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">The template is rechecked with Meta and saved parameters are validated before either option. Scheduling does not send messages immediately.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button type="button" onClick={() => queueCampaign(false)} disabled={loading || recipientCount < 1} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Validating..." : "Validate and queue · " + recipientCount}</button>
        <label className="text-sm font-medium">Schedule date & time (your local time)
          <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" />
        </label>
        <button type="button" onClick={() => queueCampaign(true)} disabled={loading || recipientCount < 1 || !scheduledAt} className="rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-800 disabled:opacity-50">{loading ? "Validating..." : "Validate and schedule"}</button>
      </div>
      {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
