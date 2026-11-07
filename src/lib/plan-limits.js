const PLAN_LIMITS = {
  free: { contacts: 500, messages: 1000, campaigns: 5 },
  starter: { contacts: 5000, messages: 10000, campaigns: 30 },
  growth: { contacts: 25000, messages: 50000, campaigns: 100 },
  business: { contacts: 100000, messages: 250000, campaigns: 500 },
};

export function getMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getContactUsageCounterKey(workspaceId) {
  return `${workspaceId.toString()}:contacts`;
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
  const [contactCount, messages, campaigns, counter, contactCounter] = await Promise.all([
    db.collection("contacts").countDocuments({ workspaceId }),
    db.collection("messages").countDocuments({
      workspaceId,
      direction: "outbound",
      status: { $in: ["accepted", "sent", "delivered", "read"] },
      timestamp: { $gte: monthStart },
    }),
    db.collection("campaigns").countDocuments({
      workspaceId,
      createdAt: { $gte: monthStart },
    }),
    db.collection("planUsageCounters").findOne({ _id: getUsagePeriodKey(workspaceId) }),
    db.collection("planUsageCounters").findOne({ _id: getContactUsageCounterKey(workspaceId) }),
  ]);
  return {
    plan,
    workspaceStatus: workspace?.status || "active",
    usage: { contacts: Math.max(contactCount, contactCounter?.contacts || 0), messages: Math.max(messages, counter?.messages || 0), campaigns: Math.max(campaigns, counter?.campaigns || 0) },
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

async function ensurePlanUsageCounter(counters, counterId, workspaceId, state, now) {
  try {
    await counters.updateOne(
      { _id: counterId },
      {
        $setOnInsert: {
          workspaceId,
          periodStart: getMonthStart(now),
          messages: state.usage.messages,
          campaigns: state.usage.campaigns,
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true },
    );
  } catch (error) {
    // Concurrent first-time reservations may race to upsert the same _id.
    // The winner creates the counter; the loser continues against that row.
    if (error?.code !== 11000) throw error;
  }

  await counters.updateOne(
    { _id: counterId },
    {
      $max: {
        messages: state.usage.messages,
        campaigns: state.usage.campaigns,
      },
      $set: { updatedAt: now },
    },
  );
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

// Release capacity only when Meta definitively rejects a request. Network
// timeouts and ambiguous outcomes keep their reservation to prevent over-sending.
export async function releaseWorkspaceMessageUsage(db, workspaceId, requested = 1) {
  if (!Number.isSafeInteger(requested) || requested < 1) return;
  const counterId = getUsagePeriodKey(workspaceId);
  await db.collection("planUsageCounters").updateOne(
    { _id: counterId, messages: { $gte: requested } },
    { $inc: { messages: -requested }, $set: { updatedAt: new Date() } },
  );
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
  const counterId = getUsagePeriodKey(workspaceId, now);
  const counters = db.collection("planUsageCounters");

  await ensurePlanUsageCounter(counters, counterId, workspaceId, state, now);

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

export async function releaseWorkspaceCampaignUsage(db, workspaceId, requested = 1) {
  if (!Number.isSafeInteger(requested) || requested < 1) return;
  const counterId = getUsagePeriodKey(workspaceId);
  await db.collection("planUsageCounters").updateOne(
    { _id: counterId, campaigns: { $gte: requested } },
    { $inc: { campaigns: -requested }, $set: { updatedAt: new Date() } },
  );
}

// Atomically reserve monthly campaign capacity before a draft is persisted.
export async function reserveWorkspaceCampaignUsage(db, workspaceId, requested = 1) {
  const state = await getWorkspacePlanUsage(db, workspaceId);
  const limit = state.limits.campaigns;
  if (state.workspaceStatus !== "active") {
    return { ...state, allowed: false, reason: "This workspace is suspended. Contact support to restore access." };
  }
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return { ...state, allowed: false, reason: "Invalid campaign reservation." };
  }

  const now = new Date();
  const counterId = getUsagePeriodKey(workspaceId, now);
  const counters = db.collection("planUsageCounters");
  await ensurePlanUsageCounter(counters, counterId, workspaceId, state, now);

  const reservation = await counters.updateOne(
    { _id: counterId, campaigns: { $lte: limit - requested } },
    { $inc: { campaigns: requested }, $set: { updatedAt: now } },
  );
  const counter = await counters.findOne({ _id: counterId });
  const used = Math.max(state.usage.campaigns, counter?.campaigns || 0);

  return {
    ...state,
    allowed: reservation.modifiedCount === 1,
    resource: "campaigns",
    used,
    limit,
    requested,
    remaining: Math.max(0, limit - used),
    usage: { ...state.usage, campaigns: used },
    reason: reservation.modifiedCount === 1 ? null : getLimitReason("campaigns"),
  };
}


// Contact allowances are lifetime workspace capacity, not monthly usage.
// Keep their reservation counter separate from the monthly message/campaign
// ledger so month rollover cannot reset the contact limit.
async function ensureContactUsageCounter(db, workspaceId, state, now) {
  const counters = db.collection("planUsageCounters");
  const counterId = getContactUsageCounterKey(workspaceId);
  try {
    await counters.updateOne(
      { _id: counterId },
      { $setOnInsert: { workspaceId, contacts: state.usage.contacts, createdAt: now }, $set: { updatedAt: now } },
      { upsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
}

export async function ensureWorkspaceContactUsageCounter(db, workspaceId) {
  const state = await getWorkspacePlanUsage(db, workspaceId);
  await ensureContactUsageCounter(db, workspaceId, state, new Date());
  return state;
}

export async function reserveWorkspaceContactUsage(db, workspaceId, requested = 1) {
  const state = await getWorkspacePlanUsage(db, workspaceId);
  const limit = state.limits.contacts;
  if (state.workspaceStatus !== "active") {
    return { ...state, allowed: false, reason: "This workspace is suspended. Contact support to restore access." };
  }
  if (!Number.isSafeInteger(requested) || requested < 1) {
    return { ...state, allowed: false, reason: "Invalid contact reservation." };
  }

  const now = new Date();
  const counterId = getContactUsageCounterKey(workspaceId);
  await ensureContactUsageCounter(db, workspaceId, state, now);
  const reservation = await db.collection("planUsageCounters").updateOne(
    { _id: counterId, contacts: { $lte: limit - requested } },
    { $inc: { contacts: requested }, $set: { updatedAt: now } },
  );
  const counter = await db.collection("planUsageCounters").findOne({ _id: counterId });
  const used = Math.max(state.usage.contacts, counter?.contacts || 0);
  return {
    ...state,
    allowed: reservation.modifiedCount === 1,
    resource: "contacts",
    used,
    limit,
    requested,
    remaining: Math.max(0, limit - used),
    usage: { ...state.usage, contacts: used },
    reason: reservation.modifiedCount === 1 ? null : getLimitReason("contacts"),
  };
}

export async function releaseWorkspaceContactUsage(db, workspaceId, requested = 1) {
  if (!Number.isSafeInteger(requested) || requested < 1) return;
  await db.collection("planUsageCounters").updateOne(
    { _id: getContactUsageCounterKey(workspaceId), contacts: { $gte: requested } },
    { $inc: { contacts: -requested }, $set: { updatedAt: new Date() } },
  );
}
