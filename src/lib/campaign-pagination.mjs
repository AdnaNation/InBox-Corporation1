import { ObjectId } from "mongodb";

export function buildCampaignHistoryFilter(workspaceId, cursor = null, status = null) {
  const filter = { workspaceId };
  if (status) filter.status = status;
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: new ObjectId(cursor.id) } },
    ];
  }
  return filter;
}

export function decodeCampaignCursor(value) {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(parsed.createdAt);
    if (!/^[a-f0-9]{24}$/i.test(String(parsed.id || "")) || !Number.isFinite(createdAt.getTime())) return null;
    return { id: String(parsed.id), createdAt };
  } catch {
    return null;
  }
}

export function encodeCampaignCursor(campaign) {
  const createdAt = campaign?.createdAt instanceof Date
    ? campaign.createdAt
    : new Date(campaign?.createdAt);
  if (!campaign?._id || !Number.isFinite(createdAt.getTime())) {
    throw new TypeError("A campaign with an ID and valid createdAt timestamp is required.");
  }
  return Buffer.from(JSON.stringify({
    createdAt: createdAt.toISOString(),
    id: campaign._id.toString(),
  })).toString("base64url");
}
