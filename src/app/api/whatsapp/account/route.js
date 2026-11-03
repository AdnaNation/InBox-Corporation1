import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { encryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(request) {
  if(!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid origin."},{status:403});
  const session = await getSession();
  if(!session) return NextResponse.json({success:false,message:"Unauthorized"},{status:401});
  try {
    const body=await request.json();
    const {phoneNumberId,wabaId,displayPhoneNumber,businessName,accessToken}=body;
    if(![phoneNumberId,wabaId,displayPhoneNumber,businessName,accessToken].every(v=>typeof v==="string"&&v.trim().length>0&&v.length<=500)) {
      return NextResponse.json({success:false,message:"Complete all WhatsApp account fields."},{status:400});
    }
    const db=await getDatabase();
    const workspaceId=new ObjectId(session.workspace.id);
    await db.collection("whatsappAccounts").updateOne(
      {workspaceId,phoneNumberId},
      {$set:{
        workspaceId,wabaId,phoneNumberId,displayPhoneNumber,businessName,
        accessTokenEncrypted:encryptSecret(accessToken.trim()),
        status:"connected",updatedAt:new Date()
      },$setOnInsert:{createdAt:new Date()}},
      {upsert:true}
    );
    return NextResponse.json({success:true,message:"WhatsApp account credentials saved."});
  } catch(error) {
    console.error("WhatsApp account save error:",error);
    return NextResponse.json({success:false,message:"Could not save WhatsApp account. Check ENCRYPTION_KEY."},{status:500});
  }
}
