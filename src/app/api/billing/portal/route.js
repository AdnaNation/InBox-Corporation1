import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PADDLE_ID_PATTERN = /^(ctm|sub)_[a-z0-9]{26}$/i;

function isPaddlePortalUrl(value) {
  return typeof value === "string" && (
    value.startsWith("https://customer-portal.paddle.com/") ||
    value.startsWith("https://buyer-portal.paddle.com/")
  );
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const session = await getSession();
    if (!session?.workspace?.id || !session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    if (!["owner", "admin"].includes(session.membership?.role)) {
      return NextResponse.json({ success: false, message: "Only workspace owners and admins can manage billing." }, { status: 403 });
    }

    const apiKey = String(process.env.PADDLE_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ success: false, message: "Subscription management is not configured yet. Contact support." }, { status: 503 });
    }

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const workspace = await db.collection("workspaces").findOne(
      { _id: workspaceId },
      { projection: { ownerId: 1, subscription: 1 } },
    );
    if (!workspace || !workspace.subscription?.paddleCustomerId || !workspace.subscription?.paddleSubscriptionId) {
      return NextResponse.json({ success: false, message: "No Paddle subscription is linked to this workspace." }, { status: 404 });
    }
    if (!PADDLE_ID_PATTERN.test(workspace.subscription.paddleCustomerId) || !PADDLE_ID_PATTERN.test(workspace.subscription.paddleSubscriptionId)) {
      return NextResponse.json({ success: false, message: "The saved Paddle subscription reference is invalid." }, { status: 409 });
    }

    const environment = process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";
    const apiBase = environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
    const response = await fetch(
      apiBase + "/customers/" + workspace.subscription.paddleCustomerId + "/portal-sessions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscription_ids: [workspace.subscription.paddleSubscriptionId] }),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!response.ok) {
      console.error("Paddle customer portal request failed with status:", response.status);
      return NextResponse.json({ success: false, message: "Paddle could not create a subscription management link. Please try again." }, { status: 502 });
    }

    const result = await response.json();
    const portal = result?.data?.urls?.subscriptions?.find(
      (item) => item.id === workspace.subscription.paddleSubscriptionId,
    );
    const urls = {
      overview: result?.data?.urls?.general?.overview,
      viewSubscription: portal?.view_subscription,
      cancelSubscription: portal?.cancel_subscription,
      updatePaymentMethod: portal?.update_subscription_payment_method,
    };
    if (!isPaddlePortalUrl(urls.viewSubscription)) {
      return NextResponse.json({ success: false, message: "Paddle returned an invalid subscription management link." }, { status: 502 });
    }

    return NextResponse.json({ success: true, urls }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Paddle customer portal error:", error);
    return NextResponse.json({ success: false, message: "Could not open subscription management." }, { status: 500 });
  }
}
