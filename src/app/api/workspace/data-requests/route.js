import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { ensureWorkspaceDataRequestIndexes, WORKSPACE_DATA_REQUEST_TYPES } from "@/lib/workspace-data-requests.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const collectionName = "workspaceDataRequests";

async function requireWorkspaceOwner() {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 }) };
  }
  if (session.membership?.role !== "owner") {
    return { response: NextResponse.json({ success: false, message: "Only the workspace owner can manage data requests." }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  try {
    const { session, response } = await requireWorkspaceOwner();
    if (response) return response;
    const db = await getDatabase();
    const collection = db.collection(collectionName);
    await ensureWorkspaceDataRequestIndexes(db);
    const workspaceId = new ObjectId(session.workspace.id);
    const requests = await collection.find(
      { workspaceId },
      { projection: { type: 1, status: 1, createdAt: 1, updatedAt: 1, reviewedAt: 1, completedAt: 1, operatorNote: 1 } },
    ).sort({ createdAt: -1 }).limit(20).toArray();

    return NextResponse.json({
      success: true,
      requests: requests.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        status: item.status,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null,
        reviewedAt: item.reviewedAt || null,
        completedAt: item.completedAt || null,
        operatorNote: item.operatorNote || null,
      })),
    });
  } catch (error) {
    console.error("Workspace data request history error:", error);
    return NextResponse.json({ success: false, message: "Could not load data request history." }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  }

  try {
    const { session, response } = await requireWorkspaceOwner();
    if (response) return response;
    const body = await request.json();
    const type = String(body.type || "").trim().toLowerCase();
    if (!WORKSPACE_DATA_REQUEST_TYPES.includes(type)) {
      return NextResponse.json({ success: false, message: "Choose a valid data request type." }, { status: 400 });
    }
    if (body.confirmed !== true) {
      return NextResponse.json({ success: false, message: "Confirm that you are authorized to make this request." }, { status: 400 });
    }

    const db = await getDatabase();
    const collection = db.collection(collectionName);
    await ensureWorkspaceDataRequestIndexes(db);
    const workspaceId = new ObjectId(session.workspace.id);
    const actorId = new ObjectId(session.user.id);
    const now = new Date();

    try {
      const result = await collection.insertOne({
        workspaceId,
        workspaceName: session.workspace.name,
        type,
        status: "pending",
        active: true,
        requestedBy: actorId,
        requesterName: session.user.name || "",
        requesterEmail: session.user.email,
        confirmedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      try {
        await db.collection("workspaceAuditLogs").insertOne({
          workspaceId,
          action: type === "export" ? "workspace_data_export_requested" : "workspace_data_deletion_requested",
          actorId,
          targetId: result.insertedId,
          details: { requestId: result.insertedId.toString(), status: "pending" },
          createdAt: now,
        });
      } catch (auditError) {
        console.error("Workspace data request audit write failed:", auditError);
      }

      return NextResponse.json({
        success: true,
        request: { id: result.insertedId.toString(), type, status: "pending", createdAt: now },
        message: type === "export"
          ? "Your export request has been recorded for secure manual processing."
          : "Your deletion request has been recorded for identity and retention review. No data has been deleted.",
      }, { status: 201 });
    } catch (error) {
      if (error?.code === 11000) {
        return NextResponse.json({ success: false, message: "A pending request of this type already exists for this workspace." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error("Create workspace data request error:", error);
    return NextResponse.json({ success: false, message: "Could not submit your data request." }, { status: 500 });
  }
}
