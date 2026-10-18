import axios from "@/lib/axios";
import { useAuthStore } from "@/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isChatMuted, useNotificationPreferences } from "../notification-preferences";
vi.mock("@/lib/axios", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ token: "session-a" });
  useNotificationPreferences.setState({ enabled: true, chats: [], loaded: false });
});
describe("notification preferences", () => {
  it("interprets expiry and indefinite mute", () => {
    expect(isChatMuted({ chat_id: "a", muted_forever: true })).toBe(true);
    expect(
      isChatMuted(
        { chat_id: "a", muted_forever: false, muted_until: new Date(2000).toISOString() },
        1000
      )
    ).toBe(true);
    expect(
      isChatMuted(
        { chat_id: "a", muted_forever: false, muted_until: new Date(1000).toISOString() },
        2000
      )
    ).toBe(false);
  });
  it("ignores responses from a previous account", async () => {
    let complete!: (data: unknown) => void;
    vi.mocked(axios.get).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const pending = useNotificationPreferences.getState().refresh();
    useAuthStore.setState({ token: "session-b" });
    complete({ data: { data: { message_notifications_enabled: false, chats: [] } } });
    await pending;
    expect(useNotificationPreferences.getState().loaded).toBe(false);
  });
  it("saves mute and global state without deleting chat preferences", async () => {
    vi.mocked(axios.put).mockResolvedValue({});
    const mute = { chat_id: "chat-a", name: "Friends", muted_forever: true };
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: { message_notifications_enabled: false, chats: [mute] } },
    });
    useNotificationPreferences.getState().mergeChats([mute]);
    await useNotificationPreferences.getState().setGlobal(false);
    expect(axios.get).toHaveBeenCalledWith("/api/notifications");
    expect(axios.put).toHaveBeenCalledWith("/api/notifications", {
      message_notifications_enabled: false,
    });
    expect(useNotificationPreferences.getState().chats).toEqual([mute]);
    await useNotificationPreferences.getState().setMute("chat-a", "off");
    expect(useNotificationPreferences.getState().chats[0].muted_forever).toBe(false);
    expect(axios.put).toHaveBeenLastCalledWith("/api/chats/chat-a/notifications", {
      muted_forever: false,
      muted_until: null,
    });
  });
});
