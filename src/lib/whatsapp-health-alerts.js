function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export async function sendWhatsAppHealthAlert({ to, eventId, workspaceName, businessName, phoneNumber, previousStatus, status, message, checkedAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { configured: false, sent: false };

  const isRecovery = status === "healthy";
  const subject = isRecovery
    ? `WhatsApp connection restored — ${workspaceName}`
    : `WhatsApp connection needs attention — ${workspaceName}`;
  const safe = {
    workspaceName: escapeHtml(workspaceName),
    businessName: escapeHtml(businessName || "WhatsApp Business account"),
    phoneNumber: escapeHtml(phoneNumber || "Connected number"),
    previousStatus: escapeHtml(previousStatus),
    status: escapeHtml(status),
    message: escapeHtml(message),
    checkedAt: escapeHtml(new Date(checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"),
  };
  const headline = isRecovery ? "Your WhatsApp connection is healthy again" : "Your WhatsApp connection needs attention";
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><div style="padding:24px;background:#0f766e;color:#fff;border-radius:12px 12px 0 0"><h1 style="margin:0;font-size:22px">InBox Corporation</h1><p style="margin:8px 0 0">${headline}</p></div><div style="padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px"><p>A scheduled health check detected a WhatsApp connection status change for <strong>${safe.workspaceName}</strong>.</p><table style="border-collapse:collapse;width:100%"><tr><td style="padding:8px 0;color:#64748b">Business</td><td style="padding:8px 0">${safe.businessName}</td></tr><tr><td style="padding:8px 0;color:#64748b">Phone number</td><td style="padding:8px 0">${safe.phoneNumber}</td></tr><tr><td style="padding:8px 0;color:#64748b">Previous status</td><td style="padding:8px 0">${safe.previousStatus}</td></tr><tr><td style="padding:8px 0;color:#64748b">Current status</td><td style="padding:8px 0"><strong>${safe.status}</strong></td></tr></table><p style="padding:14px;background:#f8fafc;border-radius:8px;line-height:1.5">${safe.message}</p><p style="font-size:12px;color:#64748b">Checked at ${safe.checkedAt}</p><p style="margin-top:24px"><a href="${escapeHtml(process.env.APP_URL || "https://inbox-corporation-new.vercel.app")}/dashboard/whatsapp" style="background:#0f766e;color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;display:inline-block">Open WhatsApp settings</a></p></div></div>`;
  const text = [
    "InBox Corporation — " + headline,
    "Workspace: " + workspaceName,
    "Business: " + (businessName || "WhatsApp Business account"),
    "Phone number: " + (phoneNumber || "Connected number"),
    "Previous status: " + previousStatus,
    "Current status: " + status,
    "Details: " + message,
    "Checked at: " + safe.checkedAt,
    (process.env.APP_URL || "https://inbox-corporation-new.vercel.app") + "/dashboard/whatsapp",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      "Idempotency-Key": "whatsapp-health-" + String(eventId),
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result?.message || "Email provider rejected the alert.");
  }
  const result = await response.json().catch(() => ({}));
  return { configured: true, sent: true, providerId: result.id || null };
}
