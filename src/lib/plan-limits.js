const PLAN_LIMITS = {
  free: { contacts: 500, messages: 1000, campaigns: 5 },
  starter: { contacts: 5000, messages: 10000, campaigns: 30 },
  growth: { contacts: 25000, messages: 50000, campaigns: 100 },
  business: { contacts: 100000, messages: 250000, campaigns: 500 },
};

export function getMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function getWorkspacePlanUsage(db, workspaceId) {
  const workspace = await db.collection("workspaces").findOne(
    { _id: workspaceId },
    { projection: { subscription: 1, status: 1 } },
  );
  const plan = PLAN_LIMITS[workspace?.subscription?.plan] ? workspace.subscription.plan : "free";
  const monthStart = getMonthStart();
  const [contacts, messages, campaigns] = await Promise.all([
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
  ]);
  return {
    plan,
    workspaceStatus: workspace?.status || "active",
    usage: { contacts, messages, campaigns },
    limits: PLAN_LIMITS[plan],
  };
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
    reason: allowed ? null : resource === "messages"
      ? "Your workspace has reached its monthly outbound message limit. Upgrade your plan to continue."
      : resource === "campaigns"
        ? "Your workspace has reached its monthly campaign limit. Upgrade your plan to continue."
        : "Your workspace has reached its contact limit. Upgrade your plan to add more contacts.",
  };
}
