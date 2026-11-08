import { completeFacebookAccountLink } from "@/lib/facebook-link";

export const runtime = "nodejs";

export async function GET(request) {
  return completeFacebookAccountLink(request);
}
