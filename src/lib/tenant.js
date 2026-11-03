import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/security";

export async function requireSession() {
  const session = await getSession();
  if (!session) return { error: jsonError("Unauthorized", 401) };
  return { session };
}
