import { describe, expect, it } from "vitest";
import { getPrivateMessageReceiptState, getReadReceiptTimestamp } from "../read-receipts";

describe("read receipts", () => {
  it("marks a message as read when other_last_read_at reaches the message timestamp", () => {
    const state = getPrivateMessageReceiptState({
      otherLastReadAt: "2026-07-17T15:00:00.000Z",
      messageCreatedAt: "2026-07-17T15:00:00.000Z",
      isOtherOnline: false,
    });

    expect(state).toBe("read");
  });

  it("keeps a message delivered, not read, when only online state is available", () => {
    const state = getPrivateMessageReceiptState({
      otherLastReadAt: "2026-07-17T14:59:59.000Z",
      messageCreatedAt: "2026-07-17T15:00:00.000Z",
      isOtherOnline: true,
    });

    expect(state).toBe("delivered");
  });

  it("uses websocket event timestamp before falling back to local time", () => {
    expect(getReadReceiptTimestamp({ timestamp: Date.parse("2026-07-17T14:40:00.000Z") })).toBe(
      "2026-07-17T14:40:00.000Z"
    );
  });
});
