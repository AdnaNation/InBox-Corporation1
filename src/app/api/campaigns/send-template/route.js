import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

export async function POST(request) {
  if(!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid origin."},{status:403});
  const session = await getSession();
  if(!session) return NextResponse.json({success:false,message:"Unauthorized"},{status:401});
  try {
    const body = await request.json();
    const {contactId,templateName,language="en_US",parameters=[]} = body;
    if(!ObjectId.isValid(contactId)||typeof templateName!=="string"||!/^[a-zA-Z0-9_]+$/.test(templateName)||!Array.isArray(parameters)||parameters.length>20||!parameters.every(v=>typeof v==="string"&&v.length<=1024)) {
      return NextResponse.json({success:false,message:"Invalid message details."},{status:400});
    }
    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const [contact,account] = await Promise.all([
      db.collection("contacts").findOne({_id:new ObjectId(contactId),workspaceId,"optIn.status":true}),
      db.collection("whatsappAccounts").findOne({workspaceId,status:"connected"})
    ]);
    if(!contact) return NextResponse.json({success:false,message:"Opted-in contact not found."},{status:404});
    if(!account) return NextResponse.json({success:false,message:"WhatsApp account is not connected."},{status:400});
    const accessToken = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v22.0";
    const components = parameters.length ? [{type:"body",parameters:parameters.map(text=>({type:"text",text}))}] : [];
    const response = await fetch(`https://graph.facebook.com/${version}/${account.phoneNumberId}/messages`,{
      method:"POST",
      headers:{Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        messaging_product:"whatsapp",
        recipient_type:"individual",
        to:contact.phone.replace(/^\+/,""),
        type:"template",
        template:{name:templateName,language:{code:language},...(components.length?{components}:{})}
      }),
      cache:"no-store"
    });
    const data = await response.json();
    const now = new Date();
    await db.collection("messages").insertOne({
      workspaceId,contactId:contact._id,direction:"outbound",type:"template",
      templateName,status:response.ok?"accepted":"failed",
      providerMessageId:data.messages?.[0]?.id||null,
      error:response.ok?null:data.error?.message||"Meta API error",
      createdAt:now,updatedAt:now
    });
    if(!response.ok) return NextResponse.json({success:false,message:data.error?.message||"Meta rejected the message."},{status:502});
    return NextResponse.json({success:true,message:"Message accepted by Meta.",messageId:data.messages?.[0]?.id});
  } catch(error) {
    console.error("Template send error:",error);
    return NextResponse.json({success:false,message:"Could not send the message."},{status:500});
  }
}
