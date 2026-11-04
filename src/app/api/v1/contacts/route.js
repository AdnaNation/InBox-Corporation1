import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authenticateApiKey(request, "contacts:read");
  if (auth.error) return NextResponse.json({ success: false, message: auth.error }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") || 100);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 500);
  const db = await getDatabase();
  const contacts = await db.collection("contacts").find({
    workspaceId: new ObjectId(auth.apiKey.workspaceId),
  }).sort({ createdAt: -1 }).limit(limit).project({
    name: 1, phone: 1, tags: 1, createdAt: 1, optIn: 1,
  }).toArray();

  return NextResponse.json({
    success: true,
    data: contacts.map((contact) => ({
      id: contact._id.toString(),
      name: contact.name,
      phone: contact.phone,
      tags: contact.tags || [],
      optedIn: contact.optIn?.status === true,
      createdAt: contact.createdAt || null,
    })),
    pagination: { limit, returned: contacts.length },
  });
}
