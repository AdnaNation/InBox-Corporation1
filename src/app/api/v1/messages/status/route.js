import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await authenticateApiKey(request, "messages:read");
  if (auth.error) {
    return NextResponse.json(
      { success: false, message: auth.error },
      {
        status: auth.status,
        headers: auth.retryAfterSeconds ? { "Retry-After": String(auth.retryAfterSeconds) } : undefined,
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const messageId = searchParams.get("messageId")?.trim() || "";
  if (!messageId || messageId.length > 255 || /[\s\u0000-\u001f]/.test(messageId)) {
    return NextResponse.json(
      { success: false, message: "Provide a valid WhatsApp messageId query parameter." },
      { status: 400 },
    );
  }

  const db = await getDatabase();
  const workspaceId = new ObjectId(auth.apiKey.workspaceId);
  const message = await db.collection("messages").findOne(
    { workspaceId, waMessageId: messageId },
    {
      projection: {
        waMessageId: 1,
        contactId: 1,
        phoneNumberId: 1,
        direction: 1,
        type: 1,
        templateName: 1,
        templateLanguage: 1,
        status: 1,
        error: 1,
        timestamp: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );

  if (!message) {
    return NextResponse.json(
      { success: false, code: "MESSAGE_NOT_FOUND", message: "Message not found in this workspace." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      messageId: message.waMessageId,
      contactId: message.contactId?.toString() || null,
      phoneNumberId: message.phoneNumberId || null,
      direction: message.direction || null,
      type: message.type || null,
      template: message.templateName
        ? { name: message.templateName, language: message.templateLanguage || null }
        : null,
      status: message.status || "unknown",
      error: message.error || null,
      timestamp: message.timestamp || null,
      createdAt: message.createdAt || null,
      updatedAt: message.updatedAt || null,
    },
  });
}
