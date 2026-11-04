const PLAN_LIMITS = {
  free: { contacts: 500, messages: 1000, campaigns: 5 },
  starter: { contacts: 5000, messages: 10000, campaigns: 30 },
  growth: { contacts: 25000, messages: 50000, campaigns: 100 },
  business: { contacts: 100000, messages: 250000, campaigns: 500 },
};

export function getMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getUsagePeriodKey(workspaceId, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${workspaceId.toString()}:${year}-${month}`;
}

export async function getWorkspacePlanUsage(db, workspaceId) {
  const workspace = await db.collection("workspaces").findOne(
    { _id: workspaceId },
    { projection: { subscription: 1, status: 1 } },
  );
  const plan = PLAN_LIMITS[workspace?.subscription?.plan] ? workspace.subscription.plan : "free";
  const monthStart = getMonthStart();
  const [contacts, messages, campaigns, counter] = await Promise.all([
    db.collection("contacts").countDocuments({ workspaceId }),
    db.collection("messages").countDocuments({
      workspaceId,
      direction: "outbound",
      timestamp: { $gte: monthStart },
    }),
    db.collection("campaigns").countDocuments({
      workspaceId,
      createdAt: { $gte: monthStart },
    }),
    db.collection("planUsageCounters").findOne({ _id: getUsagePeriodKey(workspaceId) }),
  ]);
  return {
    plan,
    workspaceStatus: workspace?.status || "active",
    usage: { contacts, messages: Math.max(messages, counter?.messages || 0), campaigns },
    limits: PLAN_LIMITS[plan],
  };
}

function getLimitReason(resource) {
  return resource === "messages"
    ? "Your workspace has reached its monthly outbound message limit. Upgrade your plan to continue."
    : resource === "campaigns"
      ? "Your workspace has reached its monthly campaign limit. Upgrade your plan to continue."
      : "Your workspace has reached its contact limit. Upgrade your plan to add more contacts.";
}

export async function checkWorkspacePlanLimit(db, workspaceId, resource, requested = 1) {
  const state = await getWorkspacePlanUsage(db, workspaceId);
  if (!state.limits[resource]) return { ...state, allowed: false, reason: "Unknown usage category." };
  if (state.workspaceStatus !== "active") {
    return { ...state, allowed: false, reason: "This workspace is suspended. Contact support to restore access." };
  }
  const used = state.usage[resource];
  const limit = state.limits[resource];
  const allowed = Number.isSafeInteger(requested) && requested >= 0 && used + requested <= limit;
  return {
    ...state,
    allowed,
    resource,
    used,
    limit,
    requested,
    remaining: Math.max(0, limit - used),
    reason: allowed ? null : getLimitReason(resource),
  };
}

// Atomically reserve monthly outbound-message capacity before contacting Meta.
// The counter is initialized from historical message records so existing usage
// remains accounted for when this reservation ledger is introduced.
export async function reserveWorkspaceMessageUsage(db, workspaceId, requested = 1) {
  const state = await getWorkspacePlanUsage(db, workspaceId);
  const limit = state.limits.messages;
  if (state.workspaceStatus !== "active") {
    return { ...state, allowed: false, reason: "This workspace is suspended. Contact support to restore access." };
  }
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return { ...state, allowed: false, reason: "Invalid message reservation." };
  }

  const now = new Date();
  const monthStart = getMonthStart(now);
  const counterId = getUsagePeriodKey(workspaceId, now);
  const counters = db.collection("planUsageCounters");

  await counters.updateOne(
    { _id: counterId },
    {
      $setOnInsert: {
        workspaceId,
        periodStart: monthStart,
        messages: state.usage.messages,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true },
  );

  // Bring a counter forward if messages were written by an older code path.
  await counters.updateOne(
    { _id: counterId },
    { $max: { messages: state.usage.messages }, $set: { updatedAt: now } },
  );

  const reservation = await counters.updateOne(
    { _id: counterId, messages: { $lte: limit - requested } },
    { $inc: { messages: requested }, $set: { updatedAt: now } },
  );
  const counter = await counters.findOne({ _id: counterId });
  const used = Math.max(state.usage.messages, counter?.messages || 0);

  return {
    ...state,
    allowed: reservation.modifiedCount === 1,
    resource: "messages",
    used,
    limit,
    requested,
    remaining: Math.max(0, limit - used),
    usage: { ...state.usage, messages: used },
    reason: reservation.modifiedCount === 1 ? null : getLimitReason("messages"),
  };
}
