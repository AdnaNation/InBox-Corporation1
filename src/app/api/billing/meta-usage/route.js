import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { aggregateMetaPricingPoints, getMetaPricingDataPoints } from "@/lib/meta-pricing-analytics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function metaGet(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const error = new Error(body?.error?.message || "Meta analytics request failed.");
    error.status = response.status;
    error.code = body?.error?.code || null;
    error.subcode = body?.error?.error_subcode || null;
    throw error;
  }
  return body;
}

function monthStartOffset(date, offset) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.workspace?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const accounts = await db.collection("whatsappAccounts").find(
      { workspaceId, status: "connected" },
      { projection: { wabaId: 1, phoneNumberId: 1, displayPhoneNumber: 1, accessTokenEncrypted: 1 } },
    ).toArray();

    if (!accounts.length) {
      return NextResponse.json({
        success: true,
        configured: false,
        costAvailable: true,
        currency: null,
        currentMonth: { month: new Date().toISOString().slice(0, 7), cost: 0, volume: 0 },
        total: { cost: 0, volume: 0 },
        byCategory: [],
        byPhone: [],
        monthly: [],
        accounts: [],
        message: "Connect a WhatsApp Business Account to view Meta usage charges.",
        fetchedAt: new Date().toISOString(),
      });
    }

    const apiVersion = process.env.META_GRAPH_API_VERSION || "v26.0";
    const now = new Date();
    const start = monthStartOffset(now, -5);
    const startTimestamp = Math.floor(start.getTime() / 1000);
    const endTimestamp = Math.floor(now.getTime() / 1000);
    const grouped = new Map();

    for (const account of accounts) {
      if (!account.wabaId || !account.phoneNumberId || !account.accessTokenEncrypted) continue;
      const key = String(account.wabaId);
      const group = grouped.get(key) || { wabaId: key, accounts: [] };
      group.accounts.push(account);
      grouped.set(key, group);
    }

    const results = await Promise.all([...grouped.values()].map(async (group) => {
      const account = group.accounts[0];
      try {
        const accessToken = decryptSecret(account.accessTokenEncrypted);
        const phoneNumbers = [...new Set(group.accounts.map((item) => String(item.displayPhoneNumber || "").replace(/\D/g, "")).filter(Boolean))];
        const phoneFilter = phoneNumbers.length ? `.phone_numbers(${JSON.stringify(phoneNumbers)})` : "";
        const fields = `pricing_analytics.start(${startTimestamp}).end(${endTimestamp}).granularity(MONTHLY)${phoneFilter}.metric_types(["COST","VOLUME"]).dimensions(["PHONE","PRICING_CATEGORY","PRICING_TYPE","COUNTRY"])`;
        const analyticsUrl = new URL(`https://graph.facebook.com/${apiVersion}/${group.wabaId}`);
        analyticsUrl.searchParams.set("fields", fields);
        const businessUrl = new URL(`https://graph.facebook.com/${apiVersion}/${group.wabaId}`);
        businessUrl.searchParams.set("fields", "id,name,currency,timezone_id");

        const [analyticsResponse, businessResponse] = await Promise.all([
          metaGet(analyticsUrl, accessToken),
          metaGet(businessUrl, accessToken).catch(() => ({})),
        ]);
        const analytics = analyticsResponse.pricing_analytics || {};
        const points = getMetaPricingDataPoints(analytics);
        if (!Array.isArray(points)) throw new Error("Meta returned an unsupported pricing analytics response format.");
        const result = aggregateMetaPricingPoints(points);
        return {
          success: true,
          wabaId: group.wabaId,
          businessName: businessResponse.name || account.businessName || "WhatsApp Business",
          currency: businessResponse.currency || null,
          connectedPhoneNumbers: group.accounts.map((item) => item.displayPhoneNumber || item.phoneNumberId),
          ...result,
        };
      } catch (error) {
        return {
          success: false,
          wabaId: group.wabaId,
          businessName: account.businessName || "WhatsApp Business",
          code: error.code || null,
          message: error.message || "Meta pricing analytics is unavailable for this account.",
        };
      }
    }));

    const successful = results.filter((item) => item.success);
    const currencies = [...new Set(successful.map((item) => item.currency).filter(Boolean))];
    const allCurrencySame = successful.length <= 1 || (successful.every((item) => item.currency) && currencies.length === 1);
    const currencyMismatch = successful.length > 1 && (!successful.every((item) => item.currency) || currencies.length > 1);
    const total = successful.reduce((sum, item) => ({
      cost: sum.cost + (item.costAvailable && allCurrencySame ? item.currentMonth.cost : 0),
      volume: sum.volume + item.currentMonth.volume,
    }), { cost: 0, volume: 0 });
    const costAvailable = successful.length === results.length && successful.length > 0 && allCurrencySame && successful.every((item) => item.costAvailable);
    const categoryMap = new Map();
    const phoneMap = new Map();
    for (const item of successful) {
      for (const row of (costAvailable ? item.byCategory : [])) {
        const key = row.category;
        const current = categoryMap.get(key) || { category: key, cost: 0, volume: 0 };
        current.cost += row.cost;
        current.volume += row.volume;
        categoryMap.set(key, current);
      }
      for (const row of item.byPhone) {
        const key = row.phoneNumber;
        const current = phoneMap.get(key) || { phoneNumber: key, cost: 0, volume: 0 };
        current.cost += costAvailable ? row.cost : 0;
        current.volume += row.volume;
        phoneMap.set(key, current);
      }
    }

    return NextResponse.json({
      success: true,
      configured: true,
      costAvailable,
      currency: allCurrencySame ? (currencies[0] || null) : null,
      currencyMismatch,
      currentMonth: {
        month: now.toISOString().slice(0, 7),
        cost: total.cost,
        volume: total.volume,
      },
      total,
      byCategory: [...categoryMap.values()].sort((a, b) => b.cost - a.cost),
      byPhone: [...phoneMap.values()].sort((a, b) => b.cost - a.cost),
      accounts: results,
      fetchedAt: new Date().toISOString(),
      period: { start: start.toISOString(), end: now.toISOString() },
      message: costAvailable
        ? null
        : successful.length !== results.length
          ? "Meta usage could not be synchronized for every connected WhatsApp account. Review each account status below and try refreshing."
          : successful.length === 0
            ? (results[0]?.message || "Meta pricing analytics is unavailable for these accounts.")
            : currencyMismatch
              ? "Connected Meta accounts use different billing currencies or their currencies could not all be confirmed. Their costs are shown separately below."
              : "Meta returned message volume without cost data. This can happen when a WABA shares a Solution Partner credit line; check the Meta invoice for the payable amount.",
    });
  } catch (error) {
    console.error("Meta WhatsApp usage overview error:", error);
    return NextResponse.json({ success: false, message: "Could not retrieve Meta WhatsApp usage. Please try again later." }, { status: 500 });
  }
}
