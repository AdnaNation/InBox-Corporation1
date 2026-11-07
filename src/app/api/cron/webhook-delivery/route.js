import { NextResponse } from "next/server";
import { request as httpsRequest } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db";
import { ensureMongoIndex } from "@/lib/mongo-indexes.mjs";
import { decryptSecret } from "@/lib/crypto";
import { signWebhookPayload, isValidWebhookTarget } from "@/lib/public-webhooks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b, c] = parts;
    if (parts.some((part) => part < 0 || part > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && c === 0) || (b === 2 && c === 0) || b === 168))
      || (a === 192 && b === 88 && c === 99)
      || (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) {
      const mapped = value.slice(7);
      return isIP(mapped) === 4 && isPublicAddress(mapped);
    }
    return /^(2|3)/.test(value)
      && !value.startsWith("2001:db8")
      && !value.startsWith("2001:0")
      && !value.startsWith("2002:");
  }
  return false;
}

async function deliver(urlValue, rawBody, timestamp, signature, eventType, eventId) {
  if (!isValidWebhookTarget(urlValue)) throw new Error("Webhook URL is not an allowed HTTPS target.");
  const url = new URL(urlValue);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
    throw new Error("Webhook hostname resolved to a non-public IP address.");
  }
  const target = addresses[0];
  return new Promise((resolve, reject) => {
    const req = httpsRequest({
      protocol: "https:", hostname: url.hostname, port: 443, method: "POST",
      path: url.pathname + url.search, servername: url.hostname,
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
      headers: {
        "Content-Type": "application/json", "User-Agent": "Wavo-Webhooks/1.0",
        "X-Wavo-Event": eventType, "X-Wavo-Delivery": eventId,
        "X-Wavo-Timestamp": String(timestamp), "X-Wavo-Signature": "sha256=" + signature,
        "Content-Length": Buffer.byteLength(rawBody),
      },
      timeout: 10000,
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode || 0));
    });
    req.on("timeout", () => req.destroy(new Error("Webhook request timed out.")));
    req.on("error", reject);
    req.end(rawBody);
  });
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }
  try {
    const db = await getDatabase();
    await Promise.all([
      ensureMongoIndex(db, "webhookSubscriptions", { workspaceId: 1, createdAt: -1 }),
      ensureMongoIndex(db, "webhookDeliveries", { subscriptionId: 1, eventId: 1 }, { unique: true }),
      ensureMongoIndex(db, "webhookDeliveries", { status: 1, nextAttemptAt: 1, leaseUntil: 1 }),
    ]);
    const workerId = randomUUID();
    const now = new Date();
    const staleLease = new Date(Date.now() - 2 * 60 * 1000);
    let processed = 0, delivered = 0, retried = 0, failed = 0;
    for (let i = 0; i < 20; i++) {
      const result = await db.collection("webhookDeliveries").findOneAndUpdate(
        { $or: [
          { status: { $in: ["pending", "retry"] }, nextAttemptAt: { $lte: now } },
          { status: "processing", leaseUntil: { $lte: staleLease } },
        ] },
        { $set: { status: "processing", leaseOwner: workerId, leaseUntil: new Date(Date.now() + 30000), updatedAt: new Date() } },
        { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: "after" },
      );
      const deliveryRecord = result?.value ?? result;
      if (!deliveryRecord?._id) break;
      processed++;
      const subscription = await db.collection("webhookSubscriptions").findOne({
        _id: deliveryRecord.subscriptionId, workspaceId: deliveryRecord.workspaceId,
        status: "active", secretEncrypted: { $exists: true, $ne: "" },
      });
      if (!subscription) {
        await db.collection("webhookDeliveries").updateOne(
          { _id: deliveryRecord._id, status: "processing", leaseOwner: workerId },
          { $set: { status: "cancelled", updatedAt: new Date() }, $unset: { leaseOwner: "", leaseUntil: "" } },
        );
        continue;
      }
      let responseStatus = 0, lastError = "";
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const rawBody = JSON.stringify(deliveryRecord.event);
        const signature = signWebhookPayload(decryptSecret(subscription.secretEncrypted), rawBody, timestamp);
        responseStatus = await deliver(subscription.url, rawBody, timestamp, signature, deliveryRecord.event?.type || "unknown", deliveryRecord.eventId);
        if (responseStatus < 200 || responseStatus >= 300) lastError = "Endpoint returned HTTP " + responseStatus + ".";
      } catch (error) {
        lastError = String(error?.message || "Webhook delivery failed.").slice(0, 300);
      }
      const attempts = Number(deliveryRecord.attempts || 0) + 1;
      const success = responseStatus >= 200 && responseStatus < 300 && !lastError;
      const terminal = !success && attempts >= 10;
      const retryAt = new Date(Date.now() + Math.min(6 * 60 * 60 * 1000, 60 * 1000 * (2 ** Math.min(attempts - 1, 8))));
      await db.collection("webhookDeliveries").updateOne(
        { _id: deliveryRecord._id, status: "processing", leaseOwner: workerId },
        { $set: {
          status: success ? "delivered" : terminal ? "failed" : "retry",
          attempts, responseStatus: responseStatus || null,
          ...(success ? { deliveredAt: new Date() } : { lastError, ...(terminal ? { failedAt: new Date() } : { nextAttemptAt: retryAt }) }),
          updatedAt: new Date(),
        }, $unset: { leaseOwner: "", leaseUntil: "" } },
      );
      if (success) {
        delivered++;
        await db.collection("webhookSubscriptions").updateOne(
          { _id: subscription._id }, { $set: { lastDeliveryAt: new Date(), updatedAt: new Date() } },
        );
      } else if (terminal) failed++;
      else retried++;
    }
    return NextResponse.json({ success: true, processed, delivered, retried, failed });
  } catch (error) {
    console.error("Webhook delivery worker error:", error);
    return NextResponse.json({ success: false, message: "Webhook delivery worker failed." }, { status: 500 });
  }
}

export async function POST(request) { return GET(request); }
