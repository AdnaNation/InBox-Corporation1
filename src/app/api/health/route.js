import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { initializeDatabase } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    await initializeDatabase();

    return NextResponse.json(
      {
        success: true,
        application: "Wavo",
        database: "connected",
        checkedAt,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("Health check:", error);

    return NextResponse.json(
      {
        success: false,
        application: "Wavo",
        database: "disconnected",
        checkedAt,
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
