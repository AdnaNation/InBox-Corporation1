import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey() {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error("ENCRYPTION_KEY is not configured");
  const key = Buffer.from(value, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 64 hex characters");
  return key;
}

export function encryptSecret(plainText) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("hex")).join(".");
}

export function decryptSecret(payload) {
  const [ivHex, tagHex, dataHex] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]).toString("utf8");
}
