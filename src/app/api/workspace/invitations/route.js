import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hashToken = (token) => createHash("sha256").update(token).digest("hex");

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ success:false, message:"Unauthorized." }, {status:401});
    if (!["owner","admin"].includes(session.membership.role)) return NextResponse.json({success:false,message:"Not allowed."},{status:403});
    const db = await getDatabase();
    const invitations = await db.collection("workspaceInvitations").find({
      workspaceId:new ObjectId(session.workspace.id),
      status:"pending",
      expiresAt:{$gt:new Date()},
    }).sort({createdAt:-1}).project({tokenHash:0}).toArray();
    return NextResponse.json({success:true,invitations:invitations.map(invite=>({
      id:invite._id.toString(), email:invite.email, role:invite.role,
      createdAt:invite.createdAt, expiresAt:invite.expiresAt,
    }))});
  } catch(error) {
    console.error("List invitations error:",error);
    return NextResponse.json({success:false,message:"Could not load invitations."},{status:500});
  }
}

export async function POST(request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid request origin."},{status:403});
    const session = await getSession();
    if (!session) return NextResponse.json({success:false,message:"Unauthorized."},{status:401});
    const actorRole = session.membership.role;
    if (!["owner","admin"].includes(actorRole)) return NextResponse.json({success:false,message:"Only workspace owners and admins can invite members."},{status:403});
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role === "admin" ? "admin" : "agent";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) return NextResponse.json({success:false,message:"Enter a valid email address."},{status:400});
    if (role === "admin" && actorRole !== "owner") return NextResponse.json({success:false,message:"Only the workspace owner can invite an admin."},{status:403});
    const db = await getDatabase();
    const user = await db.collection("users").findOne({email,status:"active"},{projection:{_id:1}});
    if (user) {
      const membership = await db.collection("memberships").findOne({workspaceId:new ObjectId(session.workspace.id),userId:user._id,status:"active"});
      if (membership) return NextResponse.json({success:false,message:"This person is already a workspace member."},{status:409});
    }
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    const invite = {
      workspaceId:new ObjectId(session.workspace.id),
      email, role, tokenHash:hashToken(token), status:"pending",
      invitedBy:new ObjectId(session.user.id), createdAt:now,
      expiresAt:new Date(now.getTime()+7*24*60*60*1000),
    };
    try {
      await db.collection("workspaceInvitations").insertOne(invite);
    } catch(error) {
      if (error.code===11000) return NextResponse.json({success:false,message:"A pending invitation already exists for this email."},{status:409});
      throw error;
    }
    const origin = new URL(request.url).origin;
    return NextResponse.json({success:true,message:"Invitation created. Share this link with the invited person.",inviteUrl:`${origin}/invite/${token}`,expiresAt:invite.expiresAt},{status:201});
  } catch(error) {
    console.error("Create invitation error:",error);
    return NextResponse.json({success:false,message:"Could not create invitation."},{status:500});
  }
}

export async function DELETE(request) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid request origin."},{status:403});
    const session = await getSession();
    if (!session) return NextResponse.json({success:false,message:"Unauthorized."},{status:401});
    if (!["owner","admin"].includes(session.membership.role)) return NextResponse.json({success:false,message:"Not allowed."},{status:403});
    const {id} = await request.json();
    if (!ObjectId.isValid(id)) return NextResponse.json({success:false,message:"Invalid invitation."},{status:400});
    const db = await getDatabase();
    const result = await db.collection("workspaceInvitations").updateOne({
      _id:new ObjectId(id), workspaceId:new ObjectId(session.workspace.id), status:"pending"
    },{$set:{status:"revoked",revokedAt:new Date(),revokedBy:new ObjectId(session.user.id)}});
    if (!result.modifiedCount) return NextResponse.json({success:false,message:"Invitation not found or already used."},{status:404});
    return NextResponse.json({success:true,message:"Invitation revoked."});
  } catch(error) {
    console.error("Revoke invitation error:",error);
    return NextResponse.json({success:false,message:"Could not revoke invitation."},{status:500});
  }
}
