export function isPlatformAdmin(session) {
  const allowedEmails = (process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const email = session?.user?.email?.trim().toLowerCase();
  return Boolean(email && allowedEmails.includes(email));
}
