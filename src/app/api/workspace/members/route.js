import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

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

    const activity = await db.collection("workspaceAuditLogs").find({ workspaceId }).sort({ createdAt: -1 }).limit(20).toArray();
    return NextResponse.json({ success: true, members, activity: activity.map((item) => ({ id: item._id.toString(), action: item.action, details: item.details || {}, createdAt: item.createdAt })) });
  } catch (error) {
    console.error("Load workspace team error:", error);
    return NextResponse.json(
      { success: false, message: "Could not load workspace team." },
      { status: 500 },
    );
  }
}


export async function DELETE(request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid request origin."},{status:403});
    const session = await getSession();
    if (!session) return NextResponse.json({success:false,message:"Unauthorized."},{status:401});
    const actorRole = session.membership.role;
    if (!["owner","admin"].includes(actorRole)) return NextResponse.json({success:false,message:"Not allowed."},{status:403});
    const {userId} = await request.json();
    if (!ObjectId.isValid(userId)) return NextResponse.json({success:false,message:"Invalid member."},{status:400});
    if (userId === session.user.id) return NextResponse.json({success:false,message:"You cannot remove yourself from this workspace."},{status:400});
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const targetId = new ObjectId(userId);
    const target = await db.collection("memberships").findOne({workspaceId,userId:targetId,status:"active"});
    if (!target) return NextResponse.json({success:false,message:"Active member not found."},{status:404});
    if (target.role === "owner") return NextResponse.json({success:false,message:"The workspace owner cannot be removed."},{status:403});
    if (target.role === "admin" && actorRole !== "owner") return NextResponse.json({success:false,message:"Only the owner can remove an admin."},{status:403});
    const now = new Date();
    await db.collection("memberships").updateOne(
      {_id:target._id,workspaceId,status:"active"},
      {$set:{status:"removed",removedAt:now,removedBy:new ObjectId(session.user.id)}}
    );
    await db.collection("workspaceAuditLogs").insertOne({
      workspaceId, action:"member_removed", actorId:new ObjectId(session.user.id), targetUserId:targetId,
      details:{ role:target.role }, createdAt:now,
    });
    return NextResponse.json({success:true,message:"Member removed from this workspace."});
  } catch(error) {
    console.error("Remove workspace member error:",error);
    return NextResponse.json({success:false,message:"Could not remove member."},{status:500});
  }
}


export async function PATCH(request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
    const session = await getSession();
    if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    if (session.membership.role !== "owner") return NextResponse.json({ success: false, message: "Only the workspace owner can change member roles." }, { status: 403 });
    const { userId, role } = await request.json();
    if (!ObjectId.isValid(userId) || !["admin", "agent"].includes(role)) return NextResponse.json({ success: false, message: "Choose a valid member and role." }, { status: 400 });
    if (userId === session.user.id) return NextResponse.json({ success: false, message: "Your owner role cannot be changed." }, { status: 400 });
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const targetUserId = new ObjectId(userId);
    const target = await db.collection("memberships").findOne({ workspaceId, userId: targetUserId, status: "active" });
    if (!target) return NextResponse.json({ success: false, message: "Active member not found." }, { status: 404 });
    if (target.role === "owner") return NextResponse.json({ success: false, message: "The workspace owner role cannot be changed." }, { status: 403 });
    if (target.role === role) return NextResponse.json({ success: true, message: "This member already has that role." });
    const now = new Date();
    const updated = await db.collection("memberships").updateOne(
      { _id: target._id, workspaceId, status: "active", role: target.role },
      { $set: { role, updatedAt: now, roleUpdatedAt: now, roleUpdatedBy: new ObjectId(session.user.id) } },
    );
    if (!updated.modifiedCount) return NextResponse.json({ success: false, message: "Member role changed elsewhere. Refresh and try again." }, { status: 409 });
    await db.collection("workspaceAuditLogs").insertOne({
      workspaceId, action: "member_role_changed", actorId: new ObjectId(session.user.id), targetUserId,
      details: { from: target.role, to: role }, createdAt: now,
    });
    return NextResponse.json({ success: true, message: "Member role updated." });
  } catch (error) {
    console.error("Update workspace member role error:", error);
    return NextResponse.json({ success: false, message: "Could not update member role." }, { status: 500 });
  }
}
