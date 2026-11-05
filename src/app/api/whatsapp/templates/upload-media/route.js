import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = {
  IMAGE: { mime: ["image/jpeg", "image/png"], max: 5 * 1024 * 1024 },
  VIDEO: { mime: ["video/mp4"], max: 16 * 1024 * 1024 },
  DOCUMENT: { mime: ["application/pdf"], max: 100 * 1024 * 1024 },
};

export async function POST(request) {
  if (!isSameOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  if (!["owner", "admin"].includes(session.membership?.role)) return NextResponse.json({ success: false, message: "Only workspace owners and admins can upload template media." }, { status: 403 });

  try {
    const data = await request.formData();
    const file = data.get("file");
    const format = String(data.get("format") || "").toUpperCase();
    const rule = TYPES[format];
    if (!rule || !file || typeof file.arrayBuffer !== "function") return NextResponse.json({ success: false, message: "Choose a supported image, MP4 video, or PDF document." }, { status: 400 });
    if (!rule.mime.includes(file.type) || file.size <= 0 || file.size > rule.max) return NextResponse.json({ success: false, message: "The selected file type or size is not supported." }, { status: 400 });
    const appId = process.env.META_APP_ID;
    if (!appId) return NextResponse.json({ success: false, message: "META_APP_ID is not configured. Add your Meta App ID to the environment variables." }, { status: 503 });

    const db = await getDatabase();
    const workspaceId = new ObjectId(session.workspace.id);
    const account = await db.collection("whatsappAccounts").findOne({ workspaceId, status: "connected" });
    if (!account?.accessTokenEncrypted) return NextResponse.json({ success: false, message: "Connect a WhatsApp account first." }, { status: 404 });
    const token = decryptSecret(account.accessTokenEncrypted);
    const version = process.env.META_GRAPH_API_VERSION || "v26.0";

    const initUrl = new URL(`https://graph.facebook.com/${version}/${appId}/uploads`);
    initUrl.searchParams.set("file_length", String(file.size));
    initUrl.searchParams.set("file_type", file.type);
    const initResponse = await fetch(initUrl, { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const init = await initResponse.json();
    if (!initResponse.ok || !init.id) return NextResponse.json({ success: false, message: init?.error?.message || "Meta could not start the media upload." }, { status: 502 });

    const bytes = await file.arrayBuffer();
    const uploadResponse = await fetch(`https://graph.facebook.com/${version}/${init.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, file_offset: "0", "Content-Type": "application/octet-stream" },
      body: bytes,
      cache: "no-store",
    });
    const uploaded = await uploadResponse.json();
    if (!uploadResponse.ok || !uploaded.h) return NextResponse.json({ success: false, message: uploaded?.error?.message || "Meta could not store the uploaded media." }, { status: 502 });
    return NextResponse.json({ success: true, handle: uploaded.h, filename: file.name });
  } catch (error) {
    console.error("Template media upload error:", error);
    return NextResponse.json({ success: false, message: "Could not upload template media to Meta." }, { status: 500 });
  }
}
