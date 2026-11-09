import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import {
  getPaddleEventId,
  getPaddleEventType,
  getPaddleItemPriceId,
  getPaddleSubscriptionStatus,
  hasPaddleInitialPayment,
  isPaddleEventStale,
  resolvePaddlePrice,
  verifyPaddleSignature,
} from "@/lib/paddle-billing.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getWorkspaceReference(customData) {
  const workspaceId = String(customData?.workspaceId || "");
  const ownerId = String(customData?.ownerId || "");
  if (!ObjectId.isValid(workspaceId) || !ObjectId.isValid(ownerId)) return null;
  return { workspaceId: new ObjectId(workspaceId), ownerId: new ObjectId(ownerId) };
}

function getEventDate(event) {
  const date = new Date(event?.occurred_at || event?.data?.updated_at || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function processTransactionCompleted(db, event) {
  const transaction = event.data || {};
  const customData = transaction.custom_data || {};
  const subscriptionId = String(transaction.subscription_id || "");
  const transactionId = String(transaction.id || "");
  if (!subscriptionId || !transactionId) {
    throw new Error("Paddle completed transaction is missing its subscription or transaction ID.");
  }

  const existingSubscription = await db.collection("billingSubscriptions").findOne({ _id: subscriptionId });
  const eventDate = getEventDate(event);
  if (isPaddleEventStale(eventDate, existingSubscription?.lastEventAt)) {
    return { outcome: "ignored", reason: "stale_transaction_event" };
  }
  const payloadReference = getWorkspaceReference(customData);
  const storedReference = existingSubscription?.workspaceId && existingSubscription?.ownerId
    ? { workspaceId: existingSubscription.workspaceId, ownerId: existingSubscription.ownerId }
    : null;
  const reference = payloadReference || storedReference;
  const items = Array.isArray(transaction.items) ? transaction.items : [];
  const suppliedPriceId = items.length === 1 ? getPaddleItemPriceId(items[0]) : null;
  const priceId = suppliedPriceId || existingSubscription?.priceId || null;
  const price = resolvePaddlePrice(priceId);

  if (!reference || !price) {
    throw new Error("Paddle completed transaction is missing a valid workspace or configured price.");
  }
  if (payloadReference && storedReference && (
    payloadReference.workspaceId.toString() !== storedReference.workspaceId.toString() ||
    payloadReference.ownerId.toString() !== storedReference.ownerId.toString()
  )) {
    throw new Error("Paddle transaction metadata does not match the stored subscription owner.");
  }
  if ((customData.plan && customData.plan !== price.plan) ||
      (customData.billingCycle && customData.billingCycle !== price.billingCycle)) {
    throw new Error("Paddle checkout metadata does not match the configured price.");
  }

  const workspace = await db.collection("workspaces").findOne({
    _id: reference.workspaceId,
    ownerId: reference.ownerId,
    status: "active",
  }, { projection: { subscription: 1 } });
  if (!workspace) return { outcome: "ignored", reason: "workspace_owner_or_status_mismatch" };
  if (existingSubscription?.status === "canceled") {
    return { outcome: "ignored", reason: "subscription_already_canceled" };
  }

  const currentSubscriptionId = workspace.subscription?.paddleSubscriptionId;
  if (currentSubscriptionId && currentSubscriptionId !== subscriptionId && ["active", "past_due", "paused"].includes(workspace.subscription?.status)) {
    await db.collection("billingTransactions").updateOne(
      { _id: transactionId },
      { $setOnInsert: {
        workspaceId: reference.workspaceId,
        paddleSubscriptionId: subscriptionId,
        status: "needs_review",
        currencyCode: transaction.currency_code || null,
        total: transaction.details?.totals?.total || null,
        createdAt: new Date(),
      } },
      { upsert: true },
    );
    return { outcome: "needs_review", reason: "workspace_already_has_an_active_subscription" };
  }

  const now = new Date();
  await db.collection("billingSubscriptions").updateOne(
    { _id: subscriptionId },
    {
      $set: {
        workspaceId: reference.workspaceId,
        ownerId: reference.ownerId,
        plan: price.plan,
        billingCycle: price.billingCycle,
        priceId,
        paddleCustomerId: transaction.customer_id || null,
        status: "active",
        lastTransactionId: transactionId,
        lastEventAt: eventDate,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  await db.collection("workspaces").updateOne(
    { _id: reference.workspaceId, ownerId: reference.ownerId, status: "active" },
    {
      $set: {
        "subscription.plan": price.plan,
        "subscription.status": "active",
        "subscription.provider": "paddle",
        "subscription.billingCycle": price.billingCycle,
        "subscription.paddleSubscriptionId": subscriptionId,
        "subscription.paddleCustomerId": transaction.customer_id || null,
        "subscription.paddleTransactionId": transactionId,
        "subscription.paddlePriceId": priceId,
        "subscription.activatedAt": now,
        "subscription.graceUntil": null,
        "subscription.paddleUpdatedAt": eventDate,
        "subscription.updatedAt": now,
        updatedAt: now,
      },
    },
  );

  await db.collection("billingTransactions").updateOne(
    { _id: transactionId },
    {
      $setOnInsert: {
        workspaceId: reference.workspaceId,
        paddleSubscriptionId: subscriptionId,
        status: "completed",
        currencyCode: transaction.currency_code || null,
        total: transaction.details?.totals?.total || null,
        invoiceNumber: transaction.invoice_number || null,
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return { outcome: "processed" };
}

async function processSubscriptionCreated(db, event) {
  const subscription = event.data || {};
  const subscriptionId = String(subscription.id || "");
  const reference = getWorkspaceReference(subscription.custom_data || {});
  const items = Array.isArray(subscription.items) ? subscription.items : [];
  const priceId = items.length === 1 ? getPaddleItemPriceId(items[0]) : null;
  const price = resolvePaddlePrice(priceId);

  if (!subscriptionId || !reference || !price) {
    return { outcome: "ignored", reason: "subscription_metadata_or_price_unavailable" };
  }

  const workspace = await db.collection("workspaces").findOne({
    _id: reference.workspaceId,
    ownerId: reference.ownerId,
    status: "active",
  }, { projection: { _id: 1 } });
  if (!workspace) return { outcome: "ignored", reason: "workspace_owner_or_status_mismatch" };

  const now = new Date();
  await db.collection("billingSubscriptions").updateOne(
    { _id: subscriptionId },
    {
      $setOnInsert: {
        workspaceId: reference.workspaceId,
        ownerId: reference.ownerId,
        plan: price.plan,
        billingCycle: price.billingCycle,
        priceId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  return { outcome: "recorded_pending_payment" };
}

async function processSubscriptionUpdate(db, event) {
  const subscription = event.data || {};
  const subscriptionId = String(subscription.id || "");
  if (!subscriptionId) return { outcome: "ignored", reason: "missing_subscription_id" };

  const stored = await db.collection("billingSubscriptions").findOne({ _id: subscriptionId });
  if (!stored) return { outcome: "ignored", reason: "subscription_not_yet_provisioned" };

  const eventDate = getEventDate(event);
  if (isPaddleEventStale(eventDate, stored.lastEventAt)) {
    return { outcome: "ignored", reason: "stale_subscription_event" };
  }

  const status = getPaddleSubscriptionStatus(event);
  if (!["active", "past_due", "paused", "canceled"].includes(status)) {
    return { outcome: "ignored", reason: "unsupported_subscription_status" };
  }
  // Do not grant a paid plan from a subscription status event alone before
  // Paddle confirms the first successful transaction.
  if (status === "active" && !hasPaddleInitialPayment(stored)) {
    return { outcome: "ignored", reason: "awaiting_initial_transaction" };
  }

  const items = Array.isArray(subscription.items) ? subscription.items : [];
  const priceId = items.length === 1 ? getPaddleItemPriceId(items[0]) : null;
  const resolvedPrice = resolvePaddlePrice(priceId);
  const now = new Date();
  const workspace = await db.collection("workspaces").findOne(
    { _id: stored.workspaceId, ownerId: stored.ownerId },
    { projection: { subscription: 1 } },
  );
  if (!workspace) return { outcome: "ignored", reason: "workspace_no_longer_matches" };

  const previousGraceUntil = workspace.subscription?.graceUntil;
  const update = {
    status,
    lastEventAt: eventDate,
    updatedAt: now,
  };
  if (resolvedPrice) {
    update.plan = resolvedPrice.plan;
    update.billingCycle = resolvedPrice.billingCycle;
    update.priceId = priceId;
  } else {
    update.plan = stored.plan;
    update.billingCycle = stored.billingCycle;
    update.priceId = stored.priceId;
  }

  const workspaceUpdate = {
    "subscription.status": status,
    "subscription.provider": "paddle",
    "subscription.paddleSubscriptionId": subscriptionId,
    "subscription.paddleUpdatedAt": eventDate,
    "subscription.updatedAt": now,
    updatedAt: now,
  };

  if (status === "active") {
    workspaceUpdate["subscription.plan"] = update.plan;
    workspaceUpdate["subscription.billingCycle"] = update.billingCycle;
    workspaceUpdate["subscription.paddlePriceId"] = update.priceId;
    workspaceUpdate["subscription.graceUntil"] = null;
  } else if (status === "past_due") {
    const graceUntil = previousGraceUntil ? new Date(previousGraceUntil) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    workspaceUpdate["subscription.graceUntil"] = graceUntil;
  } else {
    workspaceUpdate["subscription.previousPlan"] = workspace.subscription?.plan || stored.plan;
    workspaceUpdate["subscription.plan"] = "free";
    workspaceUpdate["subscription.graceUntil"] = null;
  }

  await db.collection("billingSubscriptions").updateOne(
    { _id: subscriptionId },
    { $set: update },
  );
  await db.collection("workspaces").updateOne(
    { _id: stored.workspaceId, ownerId: stored.ownerId, "subscription.paddleSubscriptionId": subscriptionId },
    { $set: workspaceUpdate },
  );

  return { outcome: "processed", status };
}

async function processPaddleEvent(db, event) {
  const type = getPaddleEventType(event);
  if (type === "transaction.completed") return processTransactionCompleted(db, event);
  if (type === "subscription.created") return processSubscriptionCreated(db, event);
  if (["subscription.updated", "subscription.canceled", "subscription.activated", "subscription.past_due", "subscription.paused", "subscription.resumed"].includes(type)) {
    return processSubscriptionUpdate(db, event);
  }
  return { outcome: "ignored", reason: "event_not_used_for_subscription_provisioning" };
}

export async function POST(request) {
  const secret = String(process.env.PADDLE_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ success: false, message: "Paddle webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("paddle-signature");
  if (!verifyPaddleSignature(rawBody, signature, secret)) {
    return NextResponse.json({ success: false, message: "Invalid webhook signature." }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid webhook payload." }, { status: 400 });
  }

  const eventId = getPaddleEventId(event);
  const eventType = getPaddleEventType(event);
  if (!eventId || !eventType) {
    return NextResponse.json({ success: false, message: "Webhook event ID or type is missing." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const events = db.collection("paddleWebhookEvents");
    if (await events.findOne({ _id: eventId }, { projection: { _id: 1 } })) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    const result = await processPaddleEvent(db, event);
    try {
      await events.insertOne({
        _id: eventId,
        eventType,
        outcome: result.outcome,
        reason: result.reason || null,
        receivedAt: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    return NextResponse.json({ success: true, outcome: result.outcome });
  } catch (error) {
    console.error("Paddle webhook processing error:", error);
    return NextResponse.json({ success: false, message: "Webhook processing failed; Paddle may retry." }, { status: 500 });
  }
}
