import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export async function POST(request) {
  let transaction;
  try {
    if (!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid request origin."},{status:403});
    const session = await getSession();
    if (!session) return NextResponse.json({success:false,message:"Please sign in with the invited email address first."},{status:401});
    const {token} = await request.json();
    if (typeof token!=="string" || token.length<32 || token.length>128) return NextResponse.json({success:false,message:"Invalid invitation link."},{status:400});
    const db = await getDatabase();
    const now = new Date();
    const invite = await db.collection("workspaceInvitations").findOne({
      tokenHash:hashToken(token), status:"pending", expiresAt:{$gt:now}
    });
    if (!invite) return NextResponse.json({success:false,message:"This invitation is invalid, expired, or already used."},{status:404});
    if (invite.email !== session.user.email.toLowerCase()) return NextResponse.json({success:false,message:`Sign in with ${invite.email} to accept this invitation.`},{status:403});
    const client = await clientPromise;
    transaction = client.startSession();
    await transaction.withTransaction(async()=>{
      const claimed = await db.collection("workspaceInvitations").updateOne({
        _id:invite._id, status:"pending", expiresAt:{$gt:now}
      },{$set:{status:"accepted",acceptedAt:now,acceptedBy:new ObjectId(session.user.id)}},{session:transaction});
      if (!claimed.modifiedCount) throw new Error("INVITATION_ALREADY_USED");
      const existing = await db.collection("memberships").findOne({
        workspaceId:invite.workspaceId,userId:new ObjectId(session.user.id)
      },{session:transaction});
      if (existing) {
        await db.collection("memberships").updateOne({_id:existing._id},{$set:{role:invite.role,status:"active",updatedAt:now}},{session:transaction});
      } else {
        await db.collection("memberships").insertOne({
          workspaceId:invite.workspaceId,userId:new ObjectId(session.user.id),
          role:invite.role,status:"active",createdAt:now
        },{session:transaction});
      }
    });
    return NextResponse.json({success:true,message:"You joined the workspace. Sign in again to switch into it.",workspaceName:(await db.collection("workspaces").findOne({_id:invite.workspaceId},{projection:{name:1}}))?.name});
  } catch(error) {
    console.error("Accept invitation error:",error);
    const status=error.message==="INVITATION_ALREADY_USED"?409:500;
    return NextResponse.json({success:false,message:status===409?"This invitation has already been used.":"Could not accept invitation."},{status});
  } finally {
    if (transaction) await transaction.endSession();
  }
}
