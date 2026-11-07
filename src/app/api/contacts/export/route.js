import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { buildContactQueryFilter } from "@/lib/contact-pagination.mjs";
import { serializeContactCsvRow } from "@/lib/contact-export.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim().slice(0, 100);
    const tag = (searchParams.get("tag") || "").trim().toLowerCase().slice(0, 30);
    const workspaceId = new ObjectId(session.workspace.id);
    const db = await getDatabase();
    const cursor = db.collection("contacts")
      .find(buildContactQueryFilter(workspaceId, { query, tag }))
      .sort({ createdAt: -1, _id: -1 })
      .project({ name: 1, phone: 1, tags: 1, optIn: 1, createdAt: 1 });
    const iterator = cursor[Symbol.asyncIterator]();
    const encoder = new TextEncoder();
    let closed = false;

    async function closeCursor() {
      if (closed) return;
      closed = true;
      await cursor.close().catch(() => {});
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("\uFEFFname,phone,tags,opted_in,created_at\\r\\n"));
      },
      async pull(controller) {
        try {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
            await closeCursor();
            return;
          }
          controller.enqueue(encoder.encode(serializeContactCsvRow(value) + "\\r\\n"));
        } catch (error) {
          await closeCursor();
          controller.error(error);
        }
      },
      async cancel() {
        await closeCursor();
      },
    });

    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wavo-contacts-${date}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Export contacts error:", error);
    return NextResponse.json({ success: false, message: "Could not export contacts." }, { status: 500 });
  }
}
