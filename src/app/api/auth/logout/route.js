import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";

export async function POST(request) {
  if (!isSameOrigin(request)) return NextResponse.json({success:false,message:"Invalid request origin."},{status:403});
  await destroySession();
  return NextResponse.json({success:true,message:"Logged out."});
}
