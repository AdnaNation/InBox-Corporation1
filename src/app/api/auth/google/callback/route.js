import { completeSocialOAuth } from "@/lib/social-oauth";

export const runtime = "nodejs";

export async function GET(request) {
  return completeSocialOAuth("google", request);
}
