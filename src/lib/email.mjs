export async function sendVerificationEmail({ to, token, origin }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const verifyUrl = new URL("/verify-email", origin);
  verifyUrl.searchParams.set("token", token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Verify your Wavo email address",
      html: "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a\">"
        + "<h1 style=\"font-size:24px\">Verify your email</h1>"
        + "<p>Confirm this email address to help secure your Wavo account and make account recovery easier.</p>"
        + "<p><a href=\"" + verifyUrl.toString() + "\" style=\"display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none\">Verify email address</a></p>"
        + "<p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>"
        + "</div>",
      text: "Verify your Wavo email address: " + verifyUrl.toString()
        + "\nThis link expires in 24 hours. If you did not create this account, you can ignore this email.",
    }),
  });

  if (!response.ok) {
    throw new Error("Email provider rejected the verification message (HTTP " + response.status + ").");
  }
}


export async function sendPasswordResetEmail({ to, token, origin }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  }

  const resetUrl = new URL("/reset-password", origin);
  resetUrl.searchParams.set("token", token);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Wavo password",
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">'
        + '<h1 style="font-size:24px">Reset your password</h1>'
        + '<p>We received a request to reset the password for your Wavo account.</p>'
        + '<p><a href="' + resetUrl.toString() + '" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Choose a new password</a></p>'
        + '<p>This link expires in 1 hour and can be used only once. If you did not request a reset, you can ignore this email.</p>'
        + '</div>',
      text: "Reset your Wavo password: " + resetUrl.toString()
        + "\nThis link expires in 1 hour and can be used only once. If you did not request a reset, you can ignore this email.",
    }),
  });

  if (!response.ok) {
    throw new Error("Email provider rejected the password reset message (HTTP " + response.status + ").");
  }
}
