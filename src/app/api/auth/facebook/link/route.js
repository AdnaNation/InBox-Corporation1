import { startFacebookAccountLink } from "@/lib/facebook-link";

export const runtime = "nodejs";

export async function GET(request) {
  return startFacebookAccountLink(request);
}
