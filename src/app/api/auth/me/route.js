import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({success:false,message:"Unauthorized"},{status:401});
  return NextResponse.json({success:true,...session});
}
