import { ObjectId } from "mongodb";

export function buildMessageHistoryFilter(baseFilter, { beforeTimestamp = null, beforeId = null } = {}) {
  const hasCursor = beforeTimestamp !== null || beforeId !== null;
  if (!hasCursor) return { valid: true, filter: baseFilter };

  const timestamp = new Date(beforeTimestamp || "");
  if (
    !beforeTimestamp ||
    Number.isNaN(timestamp.getTime()) ||
    !ObjectId.isValid(beforeId || "")
  ) {
    return { valid: false, filter: null };
  }

  return {
    valid: true,
    filter: {
      ...baseFilter,
      $or: [
        { timestamp: { $lt: timestamp } },
        { timestamp, _id: { $lt: new ObjectId(beforeId) } },
      ],
    },
  };
}
