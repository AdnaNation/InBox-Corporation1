import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthStartOffset(date, offset) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

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

function getDataPoints(analytics) {
  if (Array.isArray(analytics?.data_points)) return analytics.data_points;
  if (Array.isArray(analytics?.data?.[0]?.data_points)) return analytics.data[0].data_points;
  return [];
}

function aggregate(points, currency, phoneNumbers) {
  const categories = new Map();
  const phones = new Map();
  const months = new Map();
  let totalCost = 0;
  let totalVolume = 0;
  let hasCostField = false;

  for (const point of points) {
    const costPresent = Object.prototype.hasOwnProperty.call(point, "cost") && point.cost != null;
    if (costPresent) hasCostField = true;
    const cost = costPresent ? asNumber(point.cost) : 0;
    const volume = asNumber(point.volume);
    totalCost += cost;
    totalVolume += volume;

    const category = String(point.pricing_category || point.pricingCategory || "other").toLowerCase();
    const phone = String(point.phone_number || point.phoneNumber || "All connected numbers");
    const monthDate = point.start ? new Date(Number(point.start) * 1000) : null;
    const month = monthDate && !Number.isNaN(monthDate.getTime())
      ? monthDate.toISOString().slice(0, 7)
      : "unknown";

    const categoryRow = categories.get(category) || { category, cost: 0, volume: 0 };
    categoryRow.cost += cost;
    categoryRow.volume += volume;
    categories.set(category, categoryRow);

    const phoneRow = phones.get(phone) || { phoneNumber: phone, cost: 0, volume: 0 };
    phoneRow.cost += cost;
    phoneRow.volume += volume;
    phones.set(phone, phoneRow);

    const monthRow = months.get(month) || { month, cost: 0, volume: 0 };
    monthRow.cost += cost;
    monthRow.volume += volume;
    months.set(month, monthRow);
  }

  const currentMonth = new Date().toISOString().slice(0, 7);
  const current = months.get(currentMonth) || { month: currentMonth, cost: 0, volume: 0 };

  return {
    currency: currency || null,
    costAvailable: points.length === 0 || hasCostField,
    currentMonth: current,
    total: { cost: totalCost, volume: totalVolume },
    byCategory: [...categories.values()].sort((a, b) => b.cost - a.cost),
    byPhone: [...phones.values()].sort((a, b) => b.cost - a.cost),
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    connectedPhoneNumbers: phoneNumbers,
  };
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
        const phoneNumbers = [...new Set(group.accounts.map((item) => String(item.phoneNumberId)))];
        const fields = `pricing_analytics.start(${startTimestamp}).end(${endTimestamp}).granularity(MONTHLY).phone_numbers(${JSON.stringify(phoneNumbers)}).metric_types(["COST","VOLUME"]).dimensions(["PHONE","PRICING_CATEGORY","PRICING_TYPE","COUNTRY"])`;
        const analyticsUrl = new URL(`https://graph.facebook.com/${apiVersion}/${group.wabaId}`);
        analyticsUrl.searchParams.set("fields", fields);
        const businessUrl = new URL(`https://graph.facebook.com/${apiVersion}/${group.wabaId}`);
        businessUrl.searchParams.set("fields", "id,name,currency,timezone_id");

        const [analyticsResponse, businessResponse] = await Promise.all([
          metaGet(analyticsUrl, accessToken),
          metaGet(businessUrl, accessToken).catch(() => ({})),
        ]);
        const analytics = analyticsResponse.pricing_analytics || {};
        const points = getDataPoints(analytics);
        const result = aggregate(points, businessResponse.currency || null, phoneNumbers);
        return {
          success: true,
          wabaId: group.wabaId,
          businessName: businessResponse.name || account.businessName || "WhatsApp Business",
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
    const allCurrencySame = currencies.length <= 1;
    const total = successful.reduce((sum, item) => ({
      cost: sum.cost + (item.costAvailable ? item.currentMonth.cost : 0),
      volume: sum.volume + item.currentMonth.volume,
    }), { cost: 0, volume: 0 });
    const costAvailable = successful.length > 0 && successful.every((item) => item.costAvailable);
    const categoryMap = new Map();
    for (const item of successful) {
      for (const row of item.byCategory) {
        const key = row.category;
        const current = categoryMap.get(key) || { category: key, cost: 0, volume: 0 };
        current.cost += row.cost;
        current.volume += row.volume;
        categoryMap.set(key, current);
      }
    }

    return NextResponse.json({
      success: true,
      configured: true,
      costAvailable,
      currency: allCurrencySame ? (currencies[0] || null) : null,
      currencyMismatch: !allCurrencySame,
      currentMonth: {
        month: now.toISOString().slice(0, 7),
        cost: total.cost,
        volume: total.volume,
      },
      total,
      byCategory: [...categoryMap.values()].sort((a, b) => b.cost - a.cost),
      accounts: results,
      fetchedAt: new Date().toISOString(),
      period: { start: start.toISOString(), end: now.toISOString() },
      message: costAvailable
        ? null
        : "Meta returned message volume without cost data for at least one account. This can happen when a WABA shares a Solution Partner credit line; check the Meta invoice for the payable amount.",
    });
  } catch (error) {
    console.error("Meta WhatsApp usage overview error:", error);
    return NextResponse.json({ success: false, message: "Could not retrieve Meta WhatsApp usage. Please try again later." }, { status: 500 });
  }
}
