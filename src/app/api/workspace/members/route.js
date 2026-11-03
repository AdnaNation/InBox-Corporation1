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

    return NextResponse.json({ success: true, members });
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
    await db.collection("memberships").updateOne(
      {_id:target._id,workspaceId,status:"active"},
      {$set:{status:"removed",removedAt:new Date(),removedBy:new ObjectId(session.user.id)}}
    );
    return NextResponse.json({success:true,message:"Member removed from this workspace."});
  } catch(error) {
    console.error("Remove workspace member error:",error);
    return NextResponse.json({success:false,message:"Could not remove member."},{status:500});
  }
}
