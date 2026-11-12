import { useChatStore } from "@/store";
import type { ChatListItem } from "@/types";
import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useChatEvents } from "../use-chat-events";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const chat: ChatListItem = {
  id: "c1",
  type: "group",
  name: "Engineering",
  avatar: "avatar.png",
  unread_count: 4,
  last_message: null,
  last_read_at: "2026-11-10T10:00:00Z",
  other_last_read_at: "2026-11-10T11:00:00Z",
  is_blocked_by_me: true,
  description: "Team",
  member_count: 3,
  invite_code: "old",
  is_public: true,
  my_role: "admin",
};
const other = { ...chat, id: "c2", name: "Design" };
const pages = () => ({
  pages: [
    { data: [other], meta: { has_next: true } },
    { data: [chat], meta: { has_next: false } },
  ],
  pageParams: [undefined, "cursor"],
});

describe("chat WebSocket events", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    useChatStore.getState().reset();
    context.client.setQueryData(["chats"], pages());
    context.client.setQueryData(["chats", "search"], pages());
    context.client.setQueryData(["chat", chat.id], chat);
  });
  afterEach(() => context.client.clear());
  const list = () => context.client.getQueryData<ReturnType<typeof pages>>(["chats"])!;

  it("retains an empty sidebar page list while seeding newly announced chat details", () => {
    context.client.setQueryData(["chats"], { pages: [], pageParams: [] });
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() => result.current.handleChatNew(chat));
    expect(context.client.getQueryData(["chats"])).toEqual({ pages: [], pageParams: [] });
    expect(context.client.getQueryData(["chat", chat.id])).toMatchObject(chat);
  });
  it("uses a truncated cached name when removing an inactive chat", async () => {
    const name = "A group name longer than twenty characters";
    context.client.setQueryData(["chats"], {
      pages: [{ data: [{ ...chat, name }] }],
      pageParams: [],
    });
    const { result } = renderHook(() => useChatEvents(null), context);
    await act(async () => result.current.handleChatDelete({ payload: { chat_id: chat.id } }));
    expect(toast.error).toHaveBeenCalledWith(
      `Removed from "${name.slice(0, 20)}..."`,
      expect.anything()
    );
    expect(context.client.getQueryData(["chat", chat.id])).toBeUndefined();
  });
  it("does not fabricate detail state when a read receipt arrives before the chat is cached", () => {
    context.client.removeQueries({ queryKey: ["chat", chat.id] });
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() =>
      result.current.handleChatRead(
        { chat_id: chat.id, user_id: "other" },
        { timestamp: "2026-11-11T12:00:00Z" }
      )
    );
    expect(context.client.getQueryData(["chat", chat.id])).toBeUndefined();
    expect(list().pages[1].data[0].other_last_read_at).toBe("2026-11-11T12:00:00.000Z");
  });

  it("moves a new chat to the first page and removes repeated copies in every list", () => {
    const { result } = renderHook(() => useChatEvents({ id: "u1" }), context);
    act(() => {
      result.current.handleChatNew(chat);
      result.current.handleChatNew(chat);
    });
    for (const key of [["chats"], ["chats", "search"]]) {
      const data = context.client.getQueryData<ReturnType<typeof pages>>(key)!;
      expect(data.pages.flatMap((p) => p.data).map((c) => c.id)).toEqual(["c1", "c2"]);
      expect(data.pageParams).toEqual([undefined, "cursor"]);
    }
    expect(context.client.getQueryData(["chat", "c1"])).toMatchObject(chat);
  });

  it("seeds detail data with defaults when no list has been loaded", () => {
    context.client.clear();
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() =>
      result.current.handleChatNew({ id: "new", type: "private", name: "New" } as ChatListItem)
    );
    expect(context.client.getQueryData(["chat", "new"])).toMatchObject({
      avatar: null,
      unread_count: 0,
      last_message: null,
      is_pinned: false,
    });
    expect(context.client.getQueryData(["chats"])).toBeUndefined();
  });

  it("applies explicit empty metadata and zero counts but preserves local read and block state", () => {
    const { result } = renderHook(() => useChatEvents({ id: "u1" }), context);
    const update = {
      id: chat.id,
      name: "Renamed",
      avatar: null,
      description: "",
      invite_code: null,
      invite_expires_at: null,
      member_count: 0,
      is_public: false,
      my_role: "member",
      unread_count: 99,
      last_read_at: null,
      other_last_read_at: null,
      is_blocked_by_me: false,
    } as ChatListItem;
    act(() => result.current.handleChatUpdate(update));
    const expected = {
      name: "Renamed",
      avatar: null,
      description: "",
      invite_code: null,
      invite_expires_at: null,
      member_count: 0,
      is_public: false,
      my_role: "member",
      unread_count: 4,
      last_read_at: chat.last_read_at,
      other_last_read_at: chat.other_last_read_at,
      is_blocked_by_me: true,
    };
    expect(list().pages[1].data[0]).toMatchObject(expected);
    expect(context.client.getQueryData(["chat", "c1"])).toMatchObject(expected);
    expect(list().pages[0].data[0]).toEqual(other);
  });

  it("retains metadata omitted by a partial update", () => {
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() => result.current.handleChatUpdate({ id: chat.id, name: "" } as ChatListItem));
    expect(list().pages[1].data[0]).toEqual(chat);
    expect(context.client.getQueryData(["chat", chat.id])).toEqual(chat);
  });

  it("does not fabricate a detail entry for an unknown update", () => {
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() => result.current.handleChatUpdate({ id: "unknown", name: "Unknown" } as ChatListItem));
    expect(context.client.getQueryData(["chat", "unknown"])).toBeUndefined();
    expect(list()).toEqual(pages());
  });

  it("hides a chat from all lists without destroying its message history", () => {
    context.client.setQueryData(["messages", "c1"], { history: true });
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() => result.current.handleChatHide({ chat_id: "c1" }));
    expect(list().pages.flatMap((p) => p.data)).toEqual([other]);
    expect(context.client.getQueryData(["messages", "c1"])).toEqual({ history: true });
  });

  it.each(["chat_id", "id"])(
    "deletes active chat caches and emits navigation using payload %s",
    async (field) => {
      useChatStore.getState().setActiveChatId("c1");
      context.client.setQueryData(["messages", "c1"], { history: true });
      context.client.setQueryData(["group-members", "infinite", "c1"], ["member"]);
      const kicked = vi.fn();
      window.addEventListener("kicked-from-chat", kicked);
      try {
        const { result } = renderHook(() => useChatEvents(null), context);
        await act(async () => result.current.handleChatDelete({ payload: { [field]: "c1" } }));
        expect(kicked).toHaveBeenCalledWith(expect.objectContaining({ detail: { chatId: "c1" } }));
        expect(list().pages.flatMap((p) => p.data)).toEqual([other]);
        for (const key of [
          ["chat", "c1"],
          ["messages", "c1"],
          ["group-members", "infinite", "c1"],
        ])
          expect(context.client.getQueryData(key)).toBeUndefined();
        expect(toast.error).toHaveBeenCalledWith('Removed from "Engineering"', {
          id: "chat-deleted-c1",
        });
      } finally {
        window.removeEventListener("kicked-from-chat", kicked);
      }
    }
  );

  it("suppresses removal toast for a deletion initiated by this client", async () => {
    useChatStore.getState().addDeletedChatId("c1");
    const { result } = renderHook(() => useChatEvents(null), context);
    await act(async () => result.current.handleChatDelete({ payload: { chat_id: "c1" } }));
    expect(toast.error).not.toHaveBeenCalled();
    expect(useChatStore.getState().recentlyDeletedChatIds.has("c1")).toBe(false);
  });

  it("ignores malformed deletion events without deleting unrelated data", () => {
    const { result } = renderHook(() => useChatEvents(null), context);
    act(() => result.current.handleChatDelete({ payload: {} }));
    expect(list()).toEqual(pages());
    expect(context.client.getQueryData(["chat", "c1"])).toEqual(chat);
  });

  it("advances partner read receipts monotonically in list and detail", () => {
    const { result } = renderHook(() => useChatEvents({ id: "u1" }), context);
    act(() => {
      result.current.handleChatRead(
        { chat_id: "c1", user_id: "u2" },
        { timestamp: "2026-11-11T12:00:00Z" }
      );
      result.current.handleChatRead(
        { chat_id: "c1", user_id: "u2" },
        { timestamp: "2026-11-09T12:00:00Z" }
      );
    });
    expect(list().pages[1].data[0].other_last_read_at).toBe("2026-11-11T12:00:00.000Z");
    expect(context.client.getQueryData<ChatListItem>(["chat", "c1"])?.other_last_read_at).toBe(
      "2026-11-11T12:00:00.000Z"
    );
  });

  it("does not mark a partner's messages read when the event belongs to this user", () => {
    const { result } = renderHook(() => useChatEvents({ id: "u1" }), context);
    act(() =>
      result.current.handleChatRead(
        { chat_id: "c1", user_id: "u1" },
        { timestamp: "2026-11-11T12:00:00Z" }
      )
    );
    expect(list()).toEqual(pages());
  });
});
