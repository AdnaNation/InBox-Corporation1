import { startSocialOAuth } from "@/lib/social-oauth";

export const runtime = "nodejs";

export async function GET(request) {
  return startSocialOAuth("google", request);
}
