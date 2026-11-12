import { useChatStore } from "@/store";
import type { Message } from "@/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useMessageEvents } from "../use-message-events";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const original: Message = {
  id: "m1",
  chat_id: "group-1",
  sender_id: "u1",
  sender_name: "Person",
  content: "Original",
  type: "text",
  created_at: "2026-11-11T10:00:00Z",
  attachments: [],
  reply_to: null,
};
const group = {
  id: "group-1",
  type: "group",
  name: "Engineering",
  unread_count: 2,
  member_count: 3,
  my_role: "owner",
  last_message: original,
  invite_code: "old-code",
};
const other = { ...group, id: "group-2", name: "Other" };
const list = { pages: [{ data: [other, group], meta: {} }], pageParams: [undefined] };
const members = {
  pages: [
    {
      data: [
        { user_id: "u1", role: "owner" },
        { user_id: "u2", role: "member" },
        { user_id: "u3", role: "member" },
      ],
      meta: {},
    },
  ],
  pageParams: [undefined],
};
const history = { pages: [{ data: [original], meta: {} }], pageParams: [undefined] };

describe("WebSocket message cache reconciliation", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const clearTyping = vi.fn();
  const setTyping = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().reset();
    context = createQueryWrapper();
    context.client.setQueryData(["chats", undefined], list);
    context.client.setQueryData(["chat", group.id], group);
    context.client.setQueryData(["messages", group.id], history);
    context.client.setQueryData(["group-members", "infinite", group.id], members);
  });
  afterEach(() => {
    context.client.clear();
    vi.useRealTimers();
  });
  const details = () => context.client.getQueryData<typeof group>(["chat", group.id])!;
  const messages = () =>
    context.client.getQueryData<typeof history>(["messages", group.id])!.pages[0].data;
  const sidebar = () =>
    context.client.getQueryData<typeof list>(["chats", undefined])!.pages[0].data;
  const setup = () =>
    renderHook(() => useMessageEvents({ id: "u1" }, clearTyping, setTyping), context);
  const event = (type: string, action_data: Record<string, unknown> = {}): Message => ({
    ...original,
    id: "event-1",
    sender_id: "u2",
    type,
    action_data,
  });
  it("accepts a legacy system event without action metadata and does not clear anonymous typing", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew({
        ...original,
        id: "legacy",
        type: "system_rename",
        sender_id: "",
        action_data: undefined,
      })
    );
    expect(messages().map((message) => message.id)).toEqual(["m1", "legacy"]);
    expect(details().name).toBe("Engineering");
    expect(clearTyping).not.toHaveBeenCalled();
    expect(setTyping).not.toHaveBeenCalled();
  });
  it("preserves unrelated messages and previews when an unknown message is updated or deleted", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageUpdate({
        ...original,
        id: "unknown",
        sender_id: "",
        content: "Updated",
      })
    );
    act(() => result.current.handleMessageDelete({ payload: { message_id: "unknown" } }));
    expect(messages()).toEqual([original]);
    expect(sidebar()).toEqual(list.pages[0].data);
    expect(clearTyping).not.toHaveBeenCalled();
  });

  it.each(["empty", "missing-data"])(
    "preserves history pagination shape when receiving into %s history",
    (shape) => {
      context.client.setQueryData(["messages", group.id], {
        pages: shape === "empty" ? [] : [{ meta: {} }],
        pageParams: [],
      });
      const { result } = setup();
      act(() => result.current.handleMessageNew({ ...original, id: "new" }));
      const cached = context.client.getQueryData<typeof history>(["messages", group.id])!;
      if (shape === "empty") expect(cached.pages).toEqual([]);
      else expect(cached.pages[0].data).toEqual([{ ...original, id: "new" }]);
    }
  );

  it.each(["system_promote", "system_demote"])(
    "ignores unrelated or incomplete role metadata for %s",
    (type) => {
      const { result } = setup();
      act(() => result.current.handleMessageNew(event(type, { target_id: "unknown" })));
      expect(context.client.getQueryData(["group-members", "infinite", group.id])).toEqual(members);
      expect(details().my_role).toBe("owner");
      expect(sidebar().find((c) => c.id === group.id)?.my_role).toBe("owner");
    }
  );

  it.each(["system_leave", "system_join"])(
    "falls back to the sender when %s omits a target",
    (type) => {
      vi.useFakeTimers();
      const { result } = setup();
      act(() => result.current.handleMessageNew({ ...event(type), member_count: 2 } as Message));
      expect(details().member_count).toBe(2);
      expect(sidebar().find((c) => c.id === group.id)?.member_count).toBe(2);
      if (type === "system_leave") {
        const cached = context.client.getQueryData<typeof members>([
          "group-members",
          "infinite",
          group.id,
        ])!;
        expect(cached.pages[0].data.map((m) => m.user_id)).toEqual(["u1", "u3"]);
      }
      act(() => vi.advanceTimersByTime(1000));
    }
  );

  it("updates matching previews when message history has not been loaded", () => {
    context.client.removeQueries({ queryKey: ["messages"] });
    const { result } = setup();
    act(() =>
      result.current.handleMessageUpdate({ ...original, content: "Fresh edit", is_read: true })
    );
    expect(sidebar().find((c) => c.id === group.id)?.last_message.content).toBe("Fresh edit");
    expect(details()).not.toHaveProperty("other_last_read_at");
    expect(context.client.getQueryData(["messages", group.id])).toBeUndefined();
  });

  it("advances a read receipt even when the read message is not the sidebar's last message", () => {
    context.client.setQueryData(["chats", undefined], {
      ...list,
      pages: [
        {
          data: [
            { ...group, last_message: { ...original, id: "newer" } },
            { ...other, last_message: { ...original, id: "unrelated", chat_id: other.id } },
          ],
          meta: {},
        },
      ],
    });
    const { result } = setup();
    act(() =>
      result.current.handleMessageUpdate(
        { ...original, is_read: true },
        { timestamp: "2026-11-11T11:00:00Z" }
      )
    );
    expect(sidebar()[0].last_message.id).toBe("newer");
    expect(sidebar()[0]).toMatchObject({ other_last_read_at: "2026-11-11T11:00:00.000Z" });
    expect(details()).toMatchObject({ other_last_read_at: "2026-11-11T11:00:00.000Z" });
    expect(sidebar()[1]).not.toHaveProperty("other_last_read_at");
  });
  it("records a read message without fabricating an absent chat detail cache", () => {
    context.client.removeQueries({ queryKey: ["chat", group.id] });
    const { result } = setup();
    act(() => result.current.handleMessageUpdate({ ...original, is_read: true }));
    expect(context.client.getQueryData(["chat", group.id])).toBeUndefined();
    expect(sidebar().find((c) => c.id === group.id)).toMatchObject({
      other_last_read_at: new Date(original.created_at).toISOString(),
    });
  });
  it("uses the local deletion clock when an event omits metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const { result } = setup();
    act(() => result.current.handleMessageDelete({ payload: { message_id: "m1" } }));
    expect(messages()[0]).toMatchObject({ deleted_at: "2026-11-12T12:00:00.000Z", content: null });
  });

  it.each(["active", "own", "missing-count"])("computes unread counts for %s delivery", (mode) => {
    if (mode === "active") useChatStore.getState().setActiveChatId(group.id);
    if (mode === "missing-count") {
      context.client.setQueryData(["chat", group.id], { ...group, unread_count: undefined });
      context.client.setQueryData(["chats", undefined], {
        ...list,
        pages: [{ data: [{ ...group, unread_count: undefined }], meta: {} }],
      });
    }
    const { result } = setup();
    const incoming = { ...event("text"), ...(mode === "own" ? { sender_id: "u1" } : {}) };
    act(() => result.current.handleMessageNew(incoming));
    expect(details().unread_count).toBe(mode === "missing-count" ? 1 : 2);
    expect(sidebar()[0].unread_count).toBe(mode === "missing-count" ? 1 : 2);
  });

  it.each(["system_rename", "system_promote", "system_leave", "system_visibility", "system_join"])(
    "does not fabricate chat details for an uncached %s event",
    (type) => {
      vi.useFakeTimers();
      context.client.removeQueries({ queryKey: ["chat", group.id] });
      const { result } = setup();
      act(() =>
        result.current.handleMessageNew(
          event(type, {
            target_id: "u1",
            new_role: "admin",
            new_name: "Renamed",
            new_visibility: "public",
          })
        )
      );
      expect(context.client.getQueryData(["chat", group.id])).toBeUndefined();
      expect(sidebar()[0].last_message?.id).toBe("event-1");
      act(() => vi.advanceTimersByTime(1000));
    }
  );

  it("ignores an empty rename and preserves existing metadata", () => {
    const { result } = setup();
    act(() => result.current.handleMessageNew(event("system_rename", { new_name: "" })));
    expect(details().name).toBe("Engineering");
  });

  it("uses the sender as the old owner when ownership events omit actor_id", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew({
        ...event("system_transfer", { target_id: "u2", new_role: "owner" }),
        sender_id: "u1",
      })
    );
    expect(details().my_role).toBe("admin");
    expect(
      context.client.getQueryData<typeof members>(["group-members", "infinite", group.id])!.pages[0]
        .data
    ).toEqual([
      { user_id: "u1", role: "admin" },
      { user_id: "u2", role: "owner" },
      { user_id: "u3", role: "member" },
    ]);
  });

  it("does not overwrite the current role for another member's promotion", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew(
        event("system_promote", { target_id: "u3", new_role: "admin" })
      )
    );
    expect(details().my_role).toBe("owner");
    expect(
      context.client.getQueryData<typeof members>(["group-members", "infinite", group.id])!.pages[0]
        .data[2].role
    ).toBe("admin");
  });

  it("refreshes counts when another member joins without an authoritative count", () => {
    vi.useFakeTimers();
    const invalidate = vi.spyOn(context.client, "invalidateQueries");
    const { result } = setup();
    act(() => result.current.handleMessageNew(event("system_join", { target_id: "u4" })));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat", group.id] });
    expect(details().member_count).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
  });

  it("does not increment membership counts again for the current user's own join", () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew({
        ...event("system_join", { target_id: "u1" }),
        member_count: 99,
      } as Message)
    );
    expect(details().member_count).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
  });

  it("appends a new message, moves its chat first, increments unread and clears typing", () => {
    const { result } = setup();
    const incoming = event("text");
    act(() => result.current.handleMessageNew(incoming));
    expect(messages()).toEqual([original, incoming]);
    expect(sidebar().map((chat) => chat.id)).toEqual([group.id, other.id]);
    expect(sidebar()[0]).toMatchObject({ unread_count: 3, last_message: incoming });
    expect(details().unread_count).toBe(3);
    expect(clearTyping).toHaveBeenCalledWith("group-1-u2");
    expect(setTyping).toHaveBeenCalledWith("group-1", "u2", false);
  });

  it("does not append a message already present after a REST response", () => {
    const { result } = setup();
    act(() => result.current.handleMessageNew(original));
    expect(messages()).toEqual([original]);
    expect(details().unread_count).toBe(2);
  });

  it("keeps a jumped history window intact while updating the sidebar", () => {
    useChatStore.getState().setActiveChatId(group.id);
    useChatStore.getState().setIsJumped(true);
    const { result } = setup();
    const incoming = event("text");
    act(() => result.current.handleMessageNew(incoming));
    expect(messages()).toEqual([original]);
    expect(details()).toMatchObject({ unread_count: 2, last_message: incoming });
  });

  it("requests a chat discovery refresh when a new message belongs to an uncached chat", () => {
    const invalidate = vi.spyOn(context.client, "invalidateQueries");
    const { result } = setup();
    act(() => result.current.handleMessageNew({ ...original, chat_id: "missing" }));
    expect(sidebar()).toEqual([other, group]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chats"] });
  });

  it.each(["system_promote", "system_demote"])(
    "updates the affected member and current user's role for %s",
    (type) => {
      const { result } = setup();
      act(() =>
        result.current.handleMessageNew(event(type, { target_id: "u1", new_role: "admin" }))
      );
      expect(
        context.client.getQueryData<typeof members>(["group-members", "infinite", group.id])!
          .pages[0].data
      ).toEqual([
        { user_id: "u1", role: "admin" },
        { user_id: "u2", role: "member" },
        { user_id: "u3", role: "member" },
      ]);
      expect(details().my_role).toBe("admin");
      expect(sidebar()[0].my_role).toBe("admin");
      expect(details().unread_count).toBe(2);
    }
  );

  it("transfers ownership and demotes the former owner to admin", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew(
        event("system_transfer", { target_id: "u2", actor_id: "u1", new_role: "owner" })
      )
    );
    expect(
      context.client
        .getQueryData<typeof members>(["group-members", "infinite", group.id])!
        .pages[0].data.map((member) => member.role)
    ).toEqual(["admin", "owner", "member"]);
    expect(details().my_role).toBe("admin");
  });

  it.each(["system_kick", "system_leave"])(
    "removes the member and trusts the authoritative count for %s",
    (type) => {
      const { result } = setup();
      act(() =>
        result.current.handleMessageNew({
          ...event(type, { target_id: "u2" }),
          member_count: 7,
        } as Message)
      );
      expect(
        context.client
          .getQueryData<typeof members>(["group-members", "infinite", group.id])!
          .pages[0].data.map((member) => member.user_id)
      ).toEqual(["u1", "u3"]);
      expect(details().member_count).toBe(7);
      expect(sidebar()[0].member_count).toBe(7);
    }
  );

  it("requests fresh member counts when a leave event omits the authoritative count", () => {
    const invalidate = vi.spyOn(context.client, "invalidateQueries");
    const { result } = setup();
    act(() => result.current.handleMessageNew(event("system_leave")));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat", group.id] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chats"] });
  });

  it("removes group caches and notifies navigation when the current user is kicked", () => {
    const listener = vi.fn();
    window.addEventListener("kicked-from-chat", listener);
    try {
      const { result } = setup();
      act(() => result.current.handleMessageNew(event("system_kick", { target_id: "u1" })));
      expect(sidebar()).toEqual([other]);
      for (const key of [
        ["chat", group.id],
        ["messages", group.id],
        ["group-members", "infinite", group.id],
      ])
        expect(context.client.getQueryData(key)).toBeUndefined();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ detail: { chatId: group.id } })
      );
    } finally {
      window.removeEventListener("kicked-from-chat", listener);
    }
  });

  it("renames the group consistently in details and sidebar", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew(event("system_rename", { new_name: "New Engineering" }))
    );
    expect(details().name).toBe("New Engineering");
    expect(sidebar()[0].name).toBe("New Engineering");
    expect(sidebar()[1].name).toBe("Other");
  });

  it.each(["public", "private"])(
    "updates group visibility to %s and preserves an omitted invite",
    (visibility) => {
      const { result } = setup();
      act(() =>
        result.current.handleMessageNew(event("system_visibility", { new_visibility: visibility }))
      );
      expect(details()).toMatchObject({
        is_public: visibility === "public",
        invite_code: "old-code",
      });
      expect(sidebar()[0]).toMatchObject({
        is_public: visibility === "public",
        invite_code: "old-code",
      });
    }
  );

  it("updates invite details supplied by a visibility event", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageNew(
        event("system_visibility", {
          new_visibility: "private",
          invite_code: "new-code",
          invite_expires_at: "2026-12-01",
        })
      )
    );
    expect(details()).toMatchObject({ invite_code: "new-code", invite_expires_at: "2026-12-01" });
  });

  it("debounces membership refreshes and uses the server count", () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => {
      result.current.handleMessageNew({
        ...event("system_add", { target_id: "u4" }),
        member_count: 4,
      } as Message);
      vi.advanceTimersByTime(500);
      result.current.handleMessageNew({
        ...event("system_join", { target_id: "u5" }),
        member_count: 5,
      } as Message);
      vi.advanceTimersByTime(500);
    });
    expect(
      context.client.getQueryState(["group-members", "infinite", group.id])?.isInvalidated
    ).toBe(false);
    act(() => vi.advanceTimersByTime(500));
    expect(
      context.client.getQueryState(["group-members", "infinite", group.id])?.isInvalidated
    ).toBe(true);
    expect(details().member_count).toBe(5);
  });

  it("merges edits into history and the matching last-message preview", () => {
    const { result } = setup();
    act(() =>
      result.current.handleMessageUpdate({ ...original, content: "Edited", attachments: [] })
    );
    expect(messages()[0].content).toBe("Edited");
    expect(sidebar().find((item) => item.id === group.id)?.last_message.content).toBe("Edited");
  });

  it("does not move read receipts backwards when an older event arrives", () => {
    context.client.setQueryData(["chat", group.id], {
      ...group,
      other_last_read_at: "2026-11-11T12:00:00.000Z",
    });
    const { result } = setup();
    act(() =>
      result.current.handleMessageUpdate(
        { ...original, is_read: true },
        { timestamp: Date.parse("2026-11-11T11:00:00Z") }
      )
    );
    expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
      other_last_read_at: "2026-11-11T12:00:00.000Z",
    });
  });

  it("tombstones deleted messages, reply previews and sidebar previews", () => {
    const reply = { ...original, id: "m2", reply_to: { ...original } };
    context.client.setQueryData(["messages", group.id], {
      ...history,
      pages: [{ data: [original, reply], meta: {} }],
    });
    const { result } = setup();
    act(() =>
      result.current.handleMessageDelete({
        payload: { message_id: original.id },
        meta: { timestamp: Date.parse("2026-11-11T12:00:00Z") },
      })
    );
    expect(messages()[0]).toMatchObject({
      content: null,
      attachments: [],
      reply_to: null,
      deleted_at: "2026-11-11T12:00:00.000Z",
    });
    expect(messages()[1].reply_to).toMatchObject({
      content: null,
      attachments: [],
      deleted_at: "2026-11-11T12:00:00.000Z",
    });
    expect(sidebar()[0].last_message).toMatchObject({
      content: null,
      deleted_at: "2026-11-11T12:00:00.000Z",
    });
  });
});
