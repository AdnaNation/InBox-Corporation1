import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { DEFAULT_PLAN_PRICING, getPublicPlanPricing, normalizePlanPricing } from "@/lib/plan-pricing.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  if (!isPlatformAdmin(session)) return { response: NextResponse.json({ success: false, message: "Platform administrator access required." }, { status: 403 }) };
  return { session };
}

export async function GET() {
  try {
    const { response } = await authorize();
    if (response) return response;
    const db = await getDatabase();
    const document = await db.collection("platformSettings").findOne({ _id: "planPricing" });
    return NextResponse.json({ success: true, pricing: document ? getPublicPlanPricing(document) : DEFAULT_PLAN_PRICING, configured: Boolean(document) });
  } catch (error) {
    console.error("Platform pricing read error:", error);
    return NextResponse.json({ success: false, message: "Could not load plan pricing." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { session, response } = await authorize();
    if (response) return response;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid pricing request." }, { status: 400 });
    }

    let pricing;
    try {
      pricing = normalizePlanPricing(body);
    } catch (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    const db = await getDatabase();
    const now = new Date();
    const actorId = new ObjectId(session.user.id);
    await db.collection("platformSettings").updateOne(
      { _id: "planPricing" },
      {
        $set: { ...pricing, updatedAt: now, updatedBy: actorId },
        $setOnInsert: { createdAt: now, createdBy: actorId },
      },
      { upsert: true },
    );

    await db.collection("platformAdminAuditLogs").insertOne({
      action: "plan_pricing_updated",
      actorId,
      details: { currency: pricing.currency, plans: pricing.plans },
      createdAt: now,
    });

    return NextResponse.json({ success: true, message: "Plan pricing saved.", pricing });
  } catch (error) {
    console.error("Platform pricing update error:", error);
    return NextResponse.json({ success: false, message: "Could not save plan pricing." }, { status: 500 });
  }
}
