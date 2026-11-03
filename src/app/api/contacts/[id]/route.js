import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function DELETE(request,{params}) {
  if(!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid origin."},{status:403});
  const session = await getSession();
  if(!session) return NextResponse.json({success:false,message:"Unauthorized"},{status:401});
  const {id} = await params;
  if(!ObjectId.isValid(id)) return NextResponse.json({success:false,message:"Invalid contact ID."},{status:400});
  const db = await getDatabase();
  const result = await db.collection("contacts").deleteOne({
    _id:new ObjectId(id),
    workspaceId:new ObjectId(session.workspace.id)
  });
  if(!result.deletedCount) return NextResponse.json({success:false,message:"Contact not found."},{status:404});
  return NextResponse.json({success:true});
}
