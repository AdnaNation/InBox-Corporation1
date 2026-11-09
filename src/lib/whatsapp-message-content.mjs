export function extractWhatsAppMessageContent(message) {
  const type = message?.type || "unknown";
  const item = message?.[type];

  if (!item) {
    return { type, text: "", media: null };
  }

  if (type === "text") {
    return { type, text: item.body || "", media: null };
  }

  if (type === "button") {
    return {
      type,
      text: item.text || item.payload || "Button reply",
      media: null,
    };
  }

  if (type === "interactive") {
    const reply = item.button_reply || item.list_reply;
    return {
      type,
      text: reply?.title || reply?.description || reply?.id || "Interactive reply",
      media: null,
    };
  }

  if (
    type === "image" ||
    type === "video" ||
    type === "audio" ||
    type === "document" ||
    type === "sticker"
  ) {
    return {
      type,
      text: item.caption || "",
      media: {
        id: item.id || null,
        mimeType: item.mime_type || null,
        filename: item.filename || null,
      },
    };
  }

  if (type === "location") {
    return {
      type,
      text: item.name || item.address || "Shared location",
      location: {
        latitude: item.latitude,
        longitude: item.longitude,
        name: item.name || null,
        address: item.address || null,
      },
      media: null,
    };
  }

  return { type, text: "", media: null };
}
