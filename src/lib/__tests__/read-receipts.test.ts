import { describe, expect, it } from "vitest";
import {
  getLatestReadReceiptTimestamp,
  getPrivateMessageReceiptState,
  getReadReceiptTimestamp,
} from "../read-receipts";

describe("read receipts", () => {
  it.each([undefined, null, "invalid"])(
    "treats an absent or invalid message timestamp (%s) as sent",
    (messageCreatedAt) => {
      expect(
        getPrivateMessageReceiptState({
          messageCreatedAt,
          otherLastReadAt: "2026-01-01",
          otherLastSeenAt: "invalid",
        })
      ).toBe("sent");
    }
  );
  it("uses a later last-seen timestamp as delivery evidence even while offline", () => {
    expect(
      getPrivateMessageReceiptState({
        messageCreatedAt: "2026-01-01",
        otherLastSeenAt: "2026-01-02",
        isOtherOnline: false,
      })
    ).toBe("delivered");
  });
  it.each([undefined, { timestamp: "bad" }, { timestamp: Infinity }, { timestamp: null }])(
    "falls back to the supplied clock for invalid event metadata %j",
    (meta) => {
      expect(getReadReceiptTimestamp(meta, new Date("2026-01-01"))).toBe(
        "2026-01-01T00:00:00.000Z"
      );
    }
  );
  it.each([1767225600, "2026-01-01T00:00:00Z"])(
    "normalizes seconds or ISO event timestamps (%s)",
    (timestamp) => {
      expect(getReadReceiptTimestamp({ timestamp })).toBe("2026-01-01T00:00:00.000Z");
    }
  );
  it.each([undefined, null, "invalid", "2025-01-01"])(
    "accepts a newer receipt when the previous value is %s",
    (previous) => {
      expect(getLatestReadReceiptTimestamp(previous, "2026-01-01")).toBe("2026-01-01");
    }
  );
  it("never rewinds a valid receipt and does not compare an invalid next timestamp as a date", () => {
    expect(getLatestReadReceiptTimestamp("2026-01-02", "2026-01-01")).toBe("2026-01-02");
    expect(getLatestReadReceiptTimestamp("2026-01-02", "invalid")).toBe("invalid");
  });
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
