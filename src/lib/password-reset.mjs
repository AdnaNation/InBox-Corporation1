import { createHash, randomBytes } from "node:crypto";

export function createPasswordResetToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  };
}

export function hashPasswordResetToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}
