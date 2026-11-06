import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getWorkspacePlanUsage } from "@/lib/plan-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const state = await getWorkspacePlanUsage(db, workspaceId);

    return NextResponse.json({
      success: true,
      plan: state.plan,
      workspaceStatus: state.workspaceStatus,
      usage: state.usage,
      limits: state.limits,
      period: {
        startsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
        resetsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
      },
    });
  } catch (error) {
    console.error("[USAGE] Failed to load workspace usage:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load usage right now." },
      { status: 500 },
    );
  }
}
