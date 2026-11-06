import { getDatabase } from "@/lib/db";
import { authenticateApiKeyWithDb, hashApiKey } from "./api-key-auth-core.mjs";

export { hashApiKey };

export function authenticateApiKey(request, requiredScope) {
  return authenticateApiKeyWithDb(request, requiredScope, getDatabase);
}
