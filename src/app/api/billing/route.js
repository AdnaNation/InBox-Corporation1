import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.workspace?.id) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const workspace = await db.collection("workspaces").findOne({ _id: workspaceId }, { projection: { subscription: 1 } });
    if (!workspace) return NextResponse.json({ success: false, message: "Workspace not found." }, { status: 404 });
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const [contacts, messages, campaigns, pendingRequest] = await Promise.all([
      db.collection("contacts").countDocuments({ workspaceId }),
      db.collection("messages").countDocuments({ workspaceId, timestamp: { $gte: start } }),
      db.collection("campaigns").countDocuments({ workspaceId, createdAt: { $gte: start } }),
      db.collection("billingRequests").findOne({ workspaceId, status: "pending" }, { sort: { createdAt: -1 }, projection: { requestedPlan: 1, billingCycle: 1, createdAt: 1 } }),
    ]);
    return NextResponse.json({
      success: true,
      plan: workspace.subscription?.plan || "free",
      subscriptionStatus: workspace.subscription?.status || "active",
      usage: { contacts, messagesThisMonth: messages, campaignsThisMonth: campaigns },
      pendingRequest: pendingRequest ? { plan: pendingRequest.requestedPlan, billingCycle: pendingRequest.billingCycle, createdAt: pendingRequest.createdAt } : null,
      paymentEnabled: false,
    });
  } catch (error) {
    console.error("Billing overview error:", error);
    return NextResponse.json({ success: false, message: "Could not load billing information." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (!origin || new URL(origin).host !== host) {
      return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
    }
    const session = await getSession();
    if (!session?.workspace?.id || !session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const body = await request.json();
    const plan = String(body.plan || "").toLowerCase();
    const billingCycle = String(body.billingCycle || "").toLowerCase();
    if (!["starter", "growth", "business"].includes(plan) || !["monthly", "yearly"].includes(billingCycle)) {
      return NextResponse.json({ success: false, message: "Choose a valid plan and billing preference." }, { status: 400 });
    }
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const existing = await db.collection("billingRequests").findOne({ workspaceId, status: "pending" }, { projection: { _id: 1 } });
    if (existing) {
      return NextResponse.json({ success: false, message: "You already have a pending plan request. Our team will contact you." }, { status: 409 });
    }
    const now = new Date();
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
    return NextResponse.json({ success: true, message: "Your request was received. Our team will contact you about plan activation and payment." }, { status: 201 });
  } catch (error) {
    console.error("Plan request error:", error);
    return NextResponse.json({ success: false, message: "Could not submit your request." }, { status: 500 });
  }
}
