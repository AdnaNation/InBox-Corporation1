import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { contactSchema } from "@/lib/schemas";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({success:false,message:"Unauthorized"},{status:401});
  const db = await getDatabase();
  const contacts = await db.collection("contacts").find({
    workspaceId:new ObjectId(session.workspace.id)
  }).sort({createdAt:-1}).limit(200).toArray();
  return NextResponse.json({success:true,contacts:contacts.map(c=>({id:c._id.toString(),name:c.name,phone:c.phone,optedIn:!!c.optIn?.status}))});
}

export async function POST(request) {
  if(!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid origin."},{status:403});
  const session = await getSession();
  if(!session) return NextResponse.json({success:false,message:"Unauthorized"},{status:401});
  const parsed = contactSchema.safeParse(await request.json());
  if(!parsed.success) return NextResponse.json({success:false,message:"Enter a valid name, international phone number and confirm consent."},{status:400});
  const db = await getDatabase();
  const workspaceId = new ObjectId(session.workspace.id);
  const {name,phone,optedIn} = parsed.data;
  try {
    const doc = {
      workspaceId,name,phone,
      optIn:{status:optedIn,source:"manual",recordedBy:new ObjectId(session.user.id),date:new Date()},
      createdAt:new Date(),updatedAt:new Date()
    };
    const result = await db.collection("contacts").insertOne(doc);
    return NextResponse.json({success:true,contact:{id:result.insertedId.toString(),name,phone,optedIn:true,createdAt:doc.createdAt.toISOString()}},{status:201});
  } catch(error) {
    if(error.code===11000) return NextResponse.json({success:false,message:"This phone number already exists in this workspace."},{status:409});
    console.error(error);
    return NextResponse.json({success:false,message:"Could not save contact."},{status:500});
  }
}
