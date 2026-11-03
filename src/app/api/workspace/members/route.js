import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    if (!["owner", "admin"].includes(session.membership?.role)) {
      return NextResponse.json(
        { success: false, message: "Only workspace owners and admins can view the assignment team." },
        { status: 403 },
      );
    }

    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    const memberships = await db.collection("memberships")
      .find({ workspaceId, status: "active" })
      .sort({ createdAt: 1 })
      .toArray();

    const userIds = memberships.map((membership) => membership.userId);
    const users = await db.collection("users")
      .find({ _id: { $in: userIds }, status: "active" })
      .project({ name: 1, email: 1 })
      .toArray();

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));
    const members = memberships.flatMap((membership) => {
      const user = userMap.get(membership.userId.toString());
      if (!user) return [];
      return [{
        userId: user._id.toString(),
        name: user.name || user.email,
        email: user.email,
        role: membership.role,
      }];
    });

    return NextResponse.json({ success: true, members });
  } catch (error) {
    console.error("Load workspace team error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load workspace team." },
      { status: 500 },
    );
  }
}
