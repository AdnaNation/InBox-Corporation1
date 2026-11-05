import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_RANGES = new Set(["7d", "30d", "90d"]);

let analyticsIndexesPromise;

async function ensureIndex(collection, key) {
  // Reuse an existing index with the same ordered key pattern, regardless
  // of the name assigned when it was originally created.
  const existingIndexes = await collection.listIndexes().toArray();
  const expectedKey = Object.entries(key);
  const alreadyExists = existingIndexes.some((index) => {
    const actualKey = Object.entries(index.key || {});
    return actualKey.length === expectedKey.length
      && actualKey.every(([field, direction], position) => {
        const expected = expectedKey[position];
        return expected && expected[0] === field && expected[1] === direction;
      });
  });

  if (!alreadyExists) {
    // Let MongoDB use its standard key-derived name. This avoids conflicts
    // with equivalent indexes created elsewhere under a different name.
    await collection.createIndex(key);
  }
}

async function ensureAnalyticsIndexes(db) {
  if (!analyticsIndexesPromise) {
    analyticsIndexesPromise = Promise.all([
      ensureIndex(db.collection("messages"), { workspaceId: 1, timestamp: -1 }),
      ensureIndex(db.collection("campaigns"), { workspaceId: 1, createdAt: -1 }),
      ensureIndex(db.collection("campaignRecipients"), { workspaceId: 1, createdAt: -1 }),
      ensureIndex(db.collection("conversations"), { workspaceId: 1, status: 1 }),
      ensureIndex(db.collection("conversations"), { workspaceId: 1, createdAt: -1 }),
    ]).catch((error) => {
      analyticsIndexesPromise = null;
      throw error;
    });
  }

  return analyticsIndexesPromise;
}

function getRangeStart(range) {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { days, start };
}

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session?.workspace?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedRange = searchParams.get("range") || "30d";
    const range = ALLOWED_RANGES.has(requestedRange) ? requestedRange : "30d";
    const { days, start } = getRangeStart(range);
    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    await ensureAnalyticsIndexes(db);

    const [messageGroups, campaignGroups, recipientGroups, openConversations, conversationCount] = await Promise.all([
      db.collection("messages").aggregate([
        { $match: { workspaceId, timestamp: { $gte: start } } },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" } },
              direction: "$direction",
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
      ]).toArray(),
      db.collection("campaigns").aggregate([
        { $match: { workspaceId, createdAt: { $gte: start } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
      db.collection("campaignRecipients").aggregate([
        { $match: { workspaceId, createdAt: { $gte: start } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
      db.collection("conversations").countDocuments({ workspaceId, status: "open" }),
      db.collection("conversations").countDocuments({ workspaceId, createdAt: { $gte: start } }),
    ]);

    const dailyMap = new Map();
    const totals = { inbound: 0, outbound: 0, delivered: 0, read: 0, failed: 0 };
    for (let index = 0; index < days; index += 1) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + index);
      const key = day.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, inbound: 0, outbound: 0 });
    }

    for (const item of messageGroups) {
      const day = dailyMap.get(item._id.day);
      const count = item.count || 0;
      if (item._id.direction === "inbound") {
        totals.inbound += count;
        if (day) day.inbound += count;
      }
      if (item._id.direction === "outbound") {
        totals.outbound += count;
        if (day) day.outbound += count;
        if (item._id.status === "delivered") totals.delivered += count;
        if (item._id.status === "read") totals.read += count;
        if (item._id.status === "failed") totals.failed += count;
      }
    }

    const campaigns = Object.fromEntries(campaignGroups.map((item) => [item._id || "unknown", item.count]));
    const recipients = Object.fromEntries(recipientGroups.map((item) => [item._id || "unknown", item.count]));
    const deliveredOrRead = totals.delivered + totals.read;

    return NextResponse.json({
      success: true,
      range,
      generatedAt: new Date().toISOString(),
      totals: {
        ...totals,
        messages: totals.inbound + totals.outbound,
        deliveredOrRead,
        deliveryRate: totals.outbound ? Math.round((deliveredOrRead / totals.outbound) * 1000) / 10 : 0,
        openConversations,
        conversationsCreated: conversationCount,
      },
      campaigns,
      recipients,
      daily: Array.from(dailyMap.values()),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ success: false, message: "Could not load analytics." }, { status: 500 });
  }
}
