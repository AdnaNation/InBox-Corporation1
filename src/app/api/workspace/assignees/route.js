import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The shared inbox needs a minimal workspace roster so agents can see
// assignment targets without granting them access to team administration
// data such as invitations and audit history.
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.workspace?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    const memberships = await db.collection("memberships")
      .find({ workspaceId, status: "active" })
      .sort({ createdAt: 1 })
      .project({ userId: 1, role: 1 })
      .toArray();

    const userIds = memberships.map((membership) => membership.userId);
    const users = userIds.length
      ? await db.collection("users")
        .find({ _id: { $in: userIds }, status: "active" })
        .project({ name: 1, email: 1 })
        .toArray()
      : [];

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));
    const members = memberships.flatMap((membership) => {
      const user = userMap.get(membership.userId.toString());
      if (!user) return [];
      return [{
        userId: user._id.toString(),
        name: user.name || user.email,
        role: membership.role,
      }];
    });

    return NextResponse.json(
      { success: true, members },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Load inbox assignees error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load assignment team." },
      { status: 500 },
    );
  }
}
