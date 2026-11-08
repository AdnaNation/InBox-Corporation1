import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { getWorkspacePlanUsage } from "@/lib/plan-limits";
import { ensureBillingRequestIndexes } from "@/lib/billing-requests.mjs";
import { getPublicPlanPricing } from "@/lib/plan-pricing.mjs";
import { getPaddleCheckoutConfiguration } from "@/lib/paddle-billing.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const workspace = await db.collection("workspaces").findOne({ _id: workspaceId }, { projection: { subscription: 1, ownerId: 1 } });
    if (!workspace) return NextResponse.json({ success: false, message: "Workspace not found." }, { status: 404 });
    const [planState, pendingRequest, requestHistory, pricingDocument] = await Promise.all([
      getWorkspacePlanUsage(db, workspaceId),
      db.collection("billingRequests").findOne({ workspaceId, status: "pending" }, { sort: { createdAt: -1 }, projection: { requestedPlan: 1, billingCycle: 1, createdAt: 1 } }),
      db.collection("billingRequests").find(
        { workspaceId },
        { projection: { requestedPlan: 1, billingCycle: 1, status: 1, createdAt: 1, reviewedAt: 1 } },
      ).sort({ createdAt: -1 }).limit(10).toArray(),
      db.collection("platformSettings").findOne({ _id: "planPricing" }, { projection: { currency: 1, plans: 1 } }),
    ]);

    const canManageBilling = ["owner", "admin"].includes(session.membership?.role);
    const paddleConfiguration = getPaddleCheckoutConfiguration();
    const paddle = canManageBilling ? { ...paddleConfiguration, enabled: paddleConfiguration.enabled && planState.workspaceStatus === "active" } : {
      enabled: false,
      clientToken: null,
      environment: "production",
      priceIds: {},
    };

    return NextResponse.json({
      success: true,
      plan: planState.plan,
      subscriptionStatus: planState.subscriptionStatus,
      workspaceStatus: planState.workspaceStatus,
      usage: { contacts: planState.usage.contacts, messagesThisMonth: planState.usage.messages, campaignsThisMonth: planState.usage.campaigns },
      limits: { contacts: planState.limits.contacts, messagesThisMonth: planState.limits.messages, campaignsThisMonth: planState.limits.campaigns },
      pendingRequest: pendingRequest ? { plan: pendingRequest.requestedPlan, billingCycle: pendingRequest.billingCycle, createdAt: pendingRequest.createdAt } : null,
      requestHistory: requestHistory.map((item) => ({
        id: item._id.toString(),
        plan: item.requestedPlan,
        billingCycle: item.billingCycle,
        status: item.status,
        createdAt: item.createdAt || null,
        reviewedAt: item.reviewedAt || null,
      })),
      planPricing: getPublicPlanPricing(pricingDocument),
      paddle,
      canManageBilling,
      hasPaddleSubscription: Boolean(workspace.subscription?.paddleSubscriptionId && ["active", "past_due", "paused"].includes(workspace.subscription?.status)),
      checkoutContext: canManageBilling && planState.workspaceStatus === "active" && workspace.ownerId ? {
        workspaceId: workspaceId.toString(),
        ownerId: workspace.ownerId.toString(),
        email: session.user.email || "",
      } : null,
      paymentEnabled: paddle.enabled,
    });
  } catch (error) {
    console.error("Billing overview error:", error);
    return NextResponse.json({ success: false, message: "Could not load billing information." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
    }
    const session = await getSession();
    if (!session?.workspace?.id || !session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    if (!["owner", "admin"].includes(session.membership?.role)) {
      return NextResponse.json({ success: false, message: "Only workspace owners and admins can request a plan change." }, { status: 403 });
    }
    if (getPaddleCheckoutConfiguration().enabled) {
      return NextResponse.json({ success: false, message: "Secure checkout is enabled. Use the checkout button to subscribe." }, { status: 409 });
    }
    const body = await request.json();
    const plan = String(body.plan || "").toLowerCase();
    const billingCycle = String(body.billingCycle || "").toLowerCase();
    if (!["starter", "growth", "business"].includes(plan) || !["monthly", "yearly"].includes(billingCycle)) {
      return NextResponse.json({ success: false, message: "Choose a valid plan and billing preference." }, { status: 400 });
    }
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    await ensureBillingRequestIndexes(db);
    const existing = await db.collection("billingRequests").findOne({ workspaceId, status: "pending" }, { projection: { _id: 1 } });
    if (existing) {
      return NextResponse.json({ success: false, message: "You already have a pending plan request. Our team will contact you." }, { status: 409 });
    }
    const now = new Date();
    try {
      await db.collection("billingRequests").insertOne({
        workspaceId,
        workspaceName: session.workspace.name,
        requestedBy: new ObjectId(session.user.id),
        requesterName: session.user.name,
        requesterEmail: session.user.email,
        requestedPlan: plan,
        billingCycle,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return NextResponse.json({ success: false, message: "You already have a pending plan request. Our team will contact you." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, message: "Your request was received. Our team will contact you about plan activation and payment." }, { status: 201 });
  } catch (error) {
    console.error("Plan request error:", error);
    return NextResponse.json({ success: false, message: "Could not submit your request." }, { status: 500 });
  }
}
