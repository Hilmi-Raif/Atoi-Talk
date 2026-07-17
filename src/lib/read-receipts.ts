export type PrivateMessageReceiptState = "sent" | "delivered" | "read";

const toTime = (value?: string | null) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

export const getPrivateMessageReceiptState = ({
  otherLastReadAt,
  messageCreatedAt,
  isOtherOnline,
  otherLastSeenAt,
}: {
  otherLastReadAt?: string | null;
  messageCreatedAt?: string | null;
  isOtherOnline?: boolean;
  otherLastSeenAt?: string | null;
}): PrivateMessageReceiptState => {
  const messageTime = toTime(messageCreatedAt);
  const readTime = toTime(otherLastReadAt);

  if (messageTime !== null && readTime !== null && readTime >= messageTime) {
    return "read";
  }

  const lastSeenTime = toTime(otherLastSeenAt);
  if (
    isOtherOnline ||
    (messageTime !== null && lastSeenTime !== null && lastSeenTime > messageTime)
  ) {
    return "delivered";
  }

  return "sent";
};

export const getReadReceiptTimestamp = (
  meta?: { timestamp?: number | string | null },
  fallbackDate = new Date()
) => {
  const timestamp = meta?.timestamp;

  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    return new Date(milliseconds).toISOString();
  }

  if (typeof timestamp === "string") {
    const parsed = new Date(timestamp).getTime();
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return fallbackDate.toISOString();
};

export const getLatestReadReceiptTimestamp = (
  currentTimestamp: string | null | undefined,
  nextTimestamp: string
) => {
  const currentTime = toTime(currentTimestamp);
  const nextTime = toTime(nextTimestamp);

  if (currentTime !== null && nextTime !== null && currentTime > nextTime) {
    return currentTimestamp ?? nextTimestamp;
  }

  return nextTimestamp;
};
