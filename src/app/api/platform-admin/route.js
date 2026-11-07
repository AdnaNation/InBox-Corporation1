import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  if (!isPlatformAdmin(session)) return { response: NextResponse.json({ success: false, message: "Platform administrator access required." }, { status: 403 }) };
  return { session };
}

export async function GET() {
  try {
    const { session, response } = await requirePlatformAdmin();
    if (response) return response;

    const db = await getDatabase();
    const [workspaces, requests, totals, whatsappAccounts] = await Promise.all([
      db.collection("workspaces").find(
        {},
        { projection: { name: 1, slug: 1, status: 1, subscription: 1, ownerId: 1, createdAt: 1, updatedAt: 1 } },
      ).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection("billingRequests").find(
        {},
        { projection: { workspaceId: 1, workspaceName: 1, requestedBy: 1, requesterName: 1, requesterEmail: 1, requestedPlan: 1, billingCycle: 1, status: 1, createdAt: 1, updatedAt: 1 } },
      ).sort({ createdAt: -1 }).limit(100).toArray(),
      Promise.all([
        db.collection("workspaces").countDocuments({}),
        db.collection("workspaces").countDocuments({ status: "active" }),
        db.collection("billingRequests").countDocuments({ status: "pending" }),
      ]),
      db.collection("whatsappAccounts").find(
        {},
        { projection: { workspaceId: 1, wabaId: 1, phoneNumberId: 1, businessName: 1, displayPhoneNumber: 1, status: 1, isActive: 1, createdAt: 1, updatedAt: 1 } },
      ).sort({ updatedAt: -1, createdAt: -1 }).limit(200).toArray(),
    ]);

    const auditLogs = await db.collection("platformAdminAuditLogs")
      .find({}, { projection: { action: 1, actorId: 1, targetWorkspaceId: 1, targetId: 1, details: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(50).toArray();
    const auditActorIds = [...new Set(auditLogs.map((log) => log.actorId?.toString()).filter(Boolean))].map((id) => new ObjectId(id));
    const auditActors = auditActorIds.length
      ? await db.collection("users").find({ _id: { $in: auditActorIds } }, { projection: { name: 1, email: 1 } }).toArray()
      : [];
    const auditActorMap = new Map(auditActors.map((actor) => [actor._id.toString(), { name: actor.name || "", email: actor.email || "" }]));

    const accountWorkspaceIds = [...new Set(whatsappAccounts.map((account) => account.workspaceId?.toString()).filter(Boolean))]
      .map((id) => new ObjectId(id));
    const accountWorkspaces = accountWorkspaceIds.length
      ? await db.collection("workspaces").find(
          { _id: { $in: accountWorkspaceIds } },
          { projection: { name: 1, slug: 1 } },
        ).toArray()
      : [];
    const accountWorkspaceMap = new Map(accountWorkspaces.map((workspace) => [
      workspace._id.toString(),
      { name: workspace.name || "Workspace", slug: workspace.slug || "" },
    ]));

    const ownerIds = [...new Set(workspaces.map((workspace) => workspace.ownerId?.toString()).filter(Boolean))].map((id) => new ObjectId(id));
    const owners = ownerIds.length
      ? await db.collection("users").find({ _id: { $in: ownerIds } }, { projection: { name: 1, email: 1, status: 1 } }).toArray()
      : [];
    const ownerMap = new Map(owners.map((owner) => [owner._id.toString(), { name: owner.name || "", email: owner.email || "", status: owner.status || "active" }]));

    return NextResponse.json({
      success: true,
      stats: { totalWorkspaces: totals[0], activeWorkspaces: totals[1], pendingRequests: totals[2] },
      workspaces: workspaces.map((workspace) => ({
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status || "active",
        plan: workspace.subscription?.plan || "free",
        subscriptionStatus: workspace.subscription?.status || "active",
        createdAt: workspace.createdAt || null,
        owner: ownerMap.get(workspace.ownerId?.toString()) || null,
      })),
      auditLogs: auditLogs.map((log) => ({
        id: log._id.toString(),
        action: log.action,
        actor: auditActorMap.get(log.actorId?.toString()) || null,
        workspaceName: workspaces.find((workspace) => workspace._id.toString() === log.targetWorkspaceId?.toString())?.name || "Workspace",
        details: log.details || null,
        createdAt: log.createdAt || null,
      })),
      whatsappAccounts: whatsappAccounts.map((account) => ({
        id: account._id.toString(),
        workspaceId: account.workspaceId?.toString() || "",
        workspaceName: accountWorkspaceMap.get(account.workspaceId?.toString())?.name || "Workspace",
        workspaceSlug: accountWorkspaceMap.get(account.workspaceId?.toString())?.slug || "",
        wabaId: account.wabaId || "",
        phoneNumberId: account.phoneNumberId || "",
        businessName: account.businessName || "",
        displayPhoneNumber: account.displayPhoneNumber || "",
        status: account.status || "unknown",
        isActive: account.isActive === true,
        createdAt: account.createdAt || null,
        updatedAt: account.updatedAt || null,
      })),
      requests: requests.map((request) => ({
        id: request._id.toString(),
        workspaceName: request.workspaceName || "",
        requesterName: request.requesterName || "",
        requesterEmail: request.requesterEmail || "",
        plan: request.requestedPlan,
        billingCycle: request.billingCycle,
        status: request.status,
        createdAt: request.createdAt || null,
      })),
      admin: { email: session.user.email },
    });
  } catch (error) {
    console.error("Platform admin overview error:", error);
    return NextResponse.json({ success: false, message: "Could not load platform administration data." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { session, response } = await requirePlatformAdmin();
    if (response) return response;

    const body = await request.json();
    const action = String(body.action || "");
    const db = await getDatabase();
    const now = new Date();
    const actorId = new ObjectId(session.user.id);

    if (action === "review-request") {
      if (!ObjectId.isValid(body.requestId) || !["approved", "rejected"].includes(body.decision)) {
        return NextResponse.json({ success: false, message: "Invalid billing request action." }, { status: 400 });
      }
      const requestId = new ObjectId(body.requestId);
      const billingRequests = db.collection("billingRequests");
      // Claim the pending request before changing workspace state. This makes
      // approve/reject mutually exclusive even when two admins act concurrently.
      const claim = await billingRequests.findOneAndUpdate(
        { _id: requestId, status: "pending" },
        { $set: { status: body.decision, reviewedAt: now, reviewedBy: actorId, updatedAt: now } },
        { returnDocument: "before", includeResultMetadata: false },
      );
      const billingRequest = claim?.value || claim;
      if (!billingRequest) {
        return NextResponse.json({ success: false, message: "This request is no longer pending." }, { status: 409 });
      }

      if (body.decision === "approved") {
        const plan = String(billingRequest.requestedPlan || "").toLowerCase();
        if (!["starter", "growth", "business"].includes(plan)) {
          await billingRequests.updateOne(
            { _id: requestId, status: "approved", reviewedBy: actorId, reviewedAt: now },
            { $set: { status: "pending", updatedAt: new Date() }, $unset: { reviewedAt: "", reviewedBy: "" } },
          );
          return NextResponse.json({ success: false, message: "The requested plan is invalid." }, { status: 400 });
        }
        let workspaceUpdate;
        try {
          workspaceUpdate = await db.collection("workspaces").updateOne(
            { _id: billingRequest.workspaceId },
            { $set: { "subscription.plan": plan, "subscription.status": "active", "subscription.billingCycle": billingRequest.billingCycle, "subscription.updatedAt": now, updatedAt: now } },
          );
        } catch (error) {
          // A database/network error can happen after MongoDB has applied the
          // workspace update. Keep the request claimed rather than reopening
          // it and allowing a conflicting second decision.
          await billingRequests.updateOne(
            { _id: requestId, status: "approved", reviewedBy: actorId, reviewedAt: now },
            { $set: { activationStatus: "needs_attention", updatedAt: new Date() } },
          ).catch((trackingError) => console.error("Billing activation recovery marker failed:", trackingError));
          throw error;
        }
        if (!workspaceUpdate.matchedCount) {
          await billingRequests.updateOne(
            { _id: requestId, status: "approved", reviewedBy: actorId, reviewedAt: now },
            { $set: { status: "pending", updatedAt: new Date() }, $unset: { reviewedAt: "", reviewedBy: "" } },
          );
          return NextResponse.json({ success: false, message: "Workspace not found." }, { status: 404 });
        }
      }
      await db.collection("platformAdminAuditLogs").insertOne({
        action: body.decision === "approved" ? "billing_request_approved" : "billing_request_rejected",
        actorId,
        targetWorkspaceId: billingRequest.workspaceId,
        targetId: requestId,
        createdAt: now,
      });
      return NextResponse.json({ success: true, message: body.decision === "approved" ? "Plan approved and activated." : "Billing request rejected." });
    }

    if (action === "set-workspace-status" || action === "set-workspace-plan") {
      if (!ObjectId.isValid(body.workspaceId)) return NextResponse.json({ success: false, message: "Invalid workspace." }, { status: 400 });
      const workspaceId = new ObjectId(body.workspaceId);
      if (action === "set-workspace-status" && body.status === "suspended" && workspaceId.toString() === session.workspace.id) {
        return NextResponse.json({ success: false, message: "You cannot suspend the workspace used for your current platform admin session." }, { status: 409 });
      }
      let update;
      let auditAction;

      if (action === "set-workspace-status") {
        if (!["active", "suspended"].includes(body.status)) return NextResponse.json({ success: false, message: "Invalid workspace status." }, { status: 400 });
        update = { $set: { status: body.status, updatedAt: now } };
        auditAction = body.status === "suspended" ? "workspace_suspended" : "workspace_reactivated";
      } else {
        const plan = String(body.plan || "").toLowerCase();
        if (!["free", "starter", "growth", "business"].includes(plan)) return NextResponse.json({ success: false, message: "Invalid plan." }, { status: 400 });
        update = { $set: { "subscription.plan": plan, "subscription.status": "active", "subscription.updatedAt": now, updatedAt: now } };
        auditAction = "workspace_plan_changed";
      }

      const result = await db.collection("workspaces").updateOne({ _id: workspaceId }, update);
      if (!result.matchedCount) return NextResponse.json({ success: false, message: "Workspace not found." }, { status: 404 });
      await db.collection("platformAdminAuditLogs").insertOne({ action: auditAction, actorId, targetWorkspaceId: workspaceId, details: action === "set-workspace-status" ? { status: body.status } : { plan: body.plan }, createdAt: now });
      return NextResponse.json({ success: true, message: "Workspace updated." });
    }

    return NextResponse.json({ success: false, message: "Unknown platform admin action." }, { status: 400 });
  } catch (error) {
    console.error("Platform admin action error:", error);
    return NextResponse.json({ success: false, message: "Could not complete the platform admin action." }, { status: 500 });
  }
}
