function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function getMetaPricingDataPoints(analytics) {
  if (Array.isArray(analytics?.data_points)) return analytics.data_points;
  if (Array.isArray(analytics?.data?.[0]?.data_points)) return analytics.data[0].data_points;
  return [];
}

export function aggregateMetaPricingPoints(points, now = new Date()) {
  const categories = new Map();
  const phones = new Map();
  const months = new Map();
  let totalCost = 0;
  let totalVolume = 0;
  let hasCostField = false;
  let missingBillableCost = false;

  for (const point of points) {
    const costPresent = Object.prototype.hasOwnProperty.call(point, "cost") && point.cost != null;
    if (costPresent) hasCostField = true;
    const pricingType = String(point.pricing_type || point.pricingType || "").toLowerCase();
    if (!costPresent && !["free_customer_service", "free_entry_point"].includes(pricingType)) missingBillableCost = true;
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

  const currentMonth = now.toISOString().slice(0, 7);
  const current = months.get(currentMonth) || { month: currentMonth, cost: 0, volume: 0 };

  return {
    costAvailable: points.length === 0 || (hasCostField && !missingBillableCost),
    currentMonth: current,
    total: { cost: totalCost, volume: totalVolume },
    byCategory: [...categories.values()].sort((a, b) => b.cost - a.cost),
    byPhone: [...phones.values()].sort((a, b) => b.cost - a.cost),
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
