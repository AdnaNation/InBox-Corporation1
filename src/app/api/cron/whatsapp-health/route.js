import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classify(response, result) {
  if (response.ok) return { status: "healthy", tokenStatus: "valid", message: "Meta accepted the saved token and returned the connected phone number." };
  const code = result?.error?.code;
  if (code === 190 || response.status === 401) return { status: "attention", tokenStatus: "invalid", message: "Meta rejected the WhatsApp access token. Update the token before sending campaigns." };
  if (response.status === 403) return { status: "attention", tokenStatus: "permission", message: "Meta denied access. Check WhatsApp permissions and business asset access." };
  return { status: "unavailable", tokenStatus: "unknown", message: "Meta could not complete the health check. Retry the check; this may be temporary." };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const db = await getDatabase();
    const accounts = await db.collection("whatsappAccounts").find(
      { status: "connected", accessTokenEncrypted: { $exists: true, $ne: "" }, phoneNumberId: { $exists: true, $ne: "" } },
      { projection: { workspaceId: 1, phoneNumberId: 1, accessTokenEncrypted: 1, lastHealthStatus: 1 } },
    ).toArray();

    const checkedAt = new Date();
    let healthy = 0;
    let attention = 0;
    let unavailable = 0;
    const failures = [];

    for (const account of accounts) {
      let outcome;
      let metaDetails = {};
      try {
        const token = decryptSecret(account.accessTokenEncrypted);
        const version = process.env.META_GRAPH_API_VERSION || "v26.0";
        const url = new URL("https://graph.facebook.com/" + version + "/" + encodeURIComponent(account.phoneNumberId));
        url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating,code_verification_status");
        const response = await fetch(url, {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const result = await response.json();
        outcome = classify(response, result);
        if (response.ok && result.id === account.phoneNumberId) {
          metaDetails = {
            healthVerifiedName: result.verified_name || "",
            healthQualityRating: result.quality_rating || "UNKNOWN",
            healthCodeVerificationStatus: result.code_verification_status || "UNKNOWN",
            healthDisplayPhoneNumber: result.display_phone_number || "",
          };
        } else if (response.ok) {
          outcome = { status: "attention", tokenStatus: "mismatch", message: "Meta returned a different phone number ID. Verify the connected WhatsApp account." };
        }
      } catch (error) {
        outcome = { status: "unavailable", tokenStatus: "unknown", message: "Health check could not reach Meta: " + (error?.name === "TimeoutError" ? "request timed out." : "temporary check failure.") };
      }

      const previousStatus = account.lastHealthStatus || "unknown";
      await db.collection("whatsappAccounts").updateOne(
        { _id: account._id, status: "connected" },
        { $set: {
          lastHealthStatus: outcome.status,
          lastHealthTokenStatus: outcome.tokenStatus,
          lastHealthMessage: outcome.message,
          lastHealthCheckAt: checkedAt,
          ...metaDetails,
        } },
      );

      if (previousStatus !== outcome.status) {
        await db.collection("whatsappHealthEvents").insertOne({
          workspaceId: account.workspaceId,
          accountId: account._id,
          phoneNumberId: account.phoneNumberId,
          previousStatus,
          status: outcome.status,
          tokenStatus: outcome.tokenStatus,
          message: outcome.message,
          checkedAt,
          createdAt: checkedAt,
        });
      }

      if (outcome.status === "healthy") healthy++;
      else if (outcome.status === "attention") attention++;
      else unavailable++;
      if (outcome.status !== "healthy") failures.push({ phoneNumberId: account.phoneNumberId, status: outcome.status, message: outcome.message });
    }

    return NextResponse.json({
      success: true,
      checkedAt: checkedAt.toISOString(),
      checked: accounts.length,
      healthy,
      attention,
      unavailable,
      failures,
    });
  } catch (error) {
    console.error("WhatsApp health monitor error:", error);
    return NextResponse.json({ success: false, message: "WhatsApp health monitoring failed." }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
