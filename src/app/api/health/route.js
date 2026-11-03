import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { initializeDatabase } from "@/lib/database";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db=await getDatabase();
    await db.command({ping:1});
    await initializeDatabase();
    return NextResponse.json({success:true,application:"Wavo",database:"connected"});
  } catch(error) {
    console.error("Health check:",error);
    return NextResponse.json({success:false,database:"disconnected"},{status:500});
  }
}
