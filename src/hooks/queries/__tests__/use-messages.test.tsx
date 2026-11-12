import { messageService } from "@/services";
import { useChatStore } from "@/store";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useDeleteMessage, useJumpToMessage, useMessages, useSendMessage } from "../use-messages";

vi.mock("@/services", () => ({
  messageService: { getMessages: vi.fn(), sendMessage: vi.fn(), deleteMessage: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));
const message = {
  id: "m1",
  chat_id: "c1",
  sender_id: "u1",
  content: "Hello",
  type: "text",
  created_at: "2026-11-11T00:00:00Z",
  attachments: [],
  reply_to: null,
};
const page = (data = [message], meta = {}) => ({
  data,
  meta: { has_next: false, has_prev: false, next_cursor: "", prev_cursor: "", ...meta },
});
const infinite = (data = [message]) => ({ pages: [page(data)], pageParams: [undefined] });

describe("message queries and cache transitions", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    useChatStore.getState().reset();
    context = createQueryWrapper();
  });
  afterEach(() => {
    context.client.clear();
    vi.useRealTimers();
  });

  it.each([false, true])(
    "updates embedded reply tombstones and rolls them back on failure (%s)",
    async (fails) => {
      const reply = { ...message, id: "reply", content: "Reply body", reply_to: { ...message } };
      const before = infinite([message, reply] as never);
      context.client.setQueryData(["messages", "c1"], before);
      if (fails) vi.mocked(messageService.deleteMessage).mockRejectedValue(new Error("Denied"));
      else vi.mocked(messageService.deleteMessage).mockResolvedValue(undefined);
      const { result } = renderHook(useDeleteMessage, context);
      await act(async () => {
        const request = result.current.mutateAsync({ messageId: "m1", chatId: "c1" });
        if (fails) await expect(request).rejects.toThrow("Denied");
        else await request;
      });
      const cached = context.client.getQueryData<typeof before>(["messages", "c1"]);
      if (fails) expect(cached).toEqual(before);
      else
        expect(cached).toMatchObject({
          pages: [
            {
              data: [
                { id: "m1", deleted_at: expect.any(String) },
                {
                  id: "reply",
                  content: "Reply body",
                  reply_to: { id: "m1", deleted_at: expect.any(String) },
                },
              ],
            },
          ],
        });
    }
  );

  it("does not fetch without a chat or when explicitly disabled", async () => {
    const first = renderHook(() => useMessages(null), context);
    const second = renderHook(() => useMessages("c1", { enabled: false }), context);
    expect(first.result.current.fetchStatus).toBe("idle");
    expect(second.result.current.fetchStatus).toBe("idle");
    expect(messageService.getMessages).not.toHaveBeenCalled();
  });

  it("fetches older and newer pages using server cursors and cancellation signals", async () => {
    vi.mocked(messageService.getMessages)
      .mockResolvedValueOnce(
        page([message], {
          has_next: true,
          next_cursor: "older",
          has_prev: true,
          prev_cursor: "newer",
        }) as never
      )
      .mockResolvedValueOnce(page([{ ...message, id: "old" }]) as never)
      .mockResolvedValueOnce(page([{ ...message, id: "new" }]) as never);
    const { result } = renderHook(() => useMessages("c1"), context);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].data[0].id).toBe("m1");
    expect(messageService.getMessages).toHaveBeenNthCalledWith(
      1,
      "c1",
      { limit: 30 },
      expect.any(AbortSignal)
    );
    await act(() => result.current.fetchNextPage());
    expect(messageService.getMessages).toHaveBeenNthCalledWith(
      2,
      "c1",
      { limit: 30, cursor: "older" },
      expect.any(AbortSignal)
    );
    await act(() => result.current.fetchPreviousPage());
    expect(messageService.getMessages).toHaveBeenNthCalledWith(
      3,
      "c1",
      { limit: 30, cursor: "newer", direction: "newer" },
      expect.any(AbortSignal)
    );
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((p) => p.data.map((m) => m.id))).toEqual([
        "new",
        "m1",
        "old",
      ])
    );
  });

  it.each([400, 403, 404])("does not retry permanent message access failure %s", async (status) => {
    vi.mocked(messageService.getMessages).mockRejectedValue({ response: { status } });
    const { result } = renderHook(() => useMessages("c1"), context);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(messageService.getMessages).toHaveBeenCalledTimes(1);
  });

  it("jumps to a cached message without replacing history or calling the server", async () => {
    context.client.setQueryData(["messages", "c1"], infinite());
    const { result } = renderHook(() => useJumpToMessage("c1"), context);
    await act(async () => {
      expect(await result.current.jumpToMessage("m1")).toBe(true);
    });
    expect(result.current.jumpTargetId).toBe("m1");
    expect(result.current.jumpTimestamp).toEqual(expect.any(Number));
    expect(messageService.getMessages).not.toHaveBeenCalled();
    expect(result.current.isJumped).toBe(false);
  });

  it("marks distant cached messages as historical and can clear the jump state", async () => {
    context.client.setQueryData(
      ["messages", "c1"],
      infinite(Array.from({ length: 18 }, (_, i) => ({ ...message, id: `m${i}` })))
    );
    const { result } = renderHook(() => useJumpToMessage("c1"), context);
    await act(() => result.current.jumpToMessage("m0"));
    expect(result.current.isJumped).toBe(true);
    act(() => result.current.clearJumpState());
    expect(result.current).toMatchObject({
      isJumped: false,
      jumpTargetId: null,
      jumpTimestamp: null,
    });
  });

  it("fetches an uncached target and discards the historical window on return to latest", async () => {
    vi.mocked(messageService.getMessages).mockResolvedValue(page() as never);
    const { result } = renderHook(() => useJumpToMessage("c1"), context);
    await act(async () => {
      expect(await result.current.jumpToMessage("m1")).toBe(true);
    });
    expect(messageService.getMessages).toHaveBeenCalledWith("c1", {
      around_message_id: "m1",
      limit: 30,
    });
    expect(context.client.getQueryData(["messages", "c1"])).toEqual(infinite());
    expect(result.current.isJumped).toBe(true);
    act(() => result.current.returnToLatest());
    expect(context.client.getQueryData(["messages", "c1"])).toBeUndefined();
    expect(result.current).toMatchObject({ jumpTargetId: null, isJumped: false });
  });

  it("stops after three failed jump attempts and preserves existing history", async () => {
    vi.useFakeTimers();
    vi.mocked(messageService.getMessages).mockRejectedValue(new Error("Offline"));
    context.client.setQueryData(["messages", "c1"], infinite());
    const { result } = renderHook(() => useJumpToMessage("c1"), context);
    await act(async () => {
      const jump = result.current.jumpToMessage("missing");
      await vi.advanceTimersByTimeAsync(3000);
      expect(await jump).toBe(false);
    });
    expect(messageService.getMessages).toHaveBeenCalledTimes(3);
    expect(context.client.getQueryData(["messages", "c1"])).toEqual(infinite());
    expect(result.current.jumpTargetId).toBeNull();
  });

  it("ignores jump and return-to-latest requests without a selected chat", async () => {
    const { result } = renderHook(() => useJumpToMessage(null), context);
    await act(async () => {
      expect(await result.current.jumpToMessage("m1")).toBe(false);
    });
    act(() => result.current.returnToLatest());
    expect(messageService.getMessages).not.toHaveBeenCalled();
  });

  it("deduplicates a sent message already inserted by WebSocket delivery", async () => {
    context.client.setQueryData(["messages", "c1"], infinite());
    vi.mocked(messageService.sendMessage).mockResolvedValue(message as never);
    const { result } = renderHook(useSendMessage, context);
    await act(() => result.current.mutateAsync({ chat_id: "c1", type: "text", content: "Hello" }));
    expect(context.client.getQueryData(["messages", "c1"])).toEqual(infinite());
  });
  it.each([{ pages: [] }, { pages: [{ meta: {} }] }])(
    "preserves incomplete message windows when sending with %j",
    async ({ pages }) => {
      context.client.setQueryData(["messages", "c1"], { pages, pageParams: [] });
      vi.mocked(messageService.sendMessage).mockResolvedValue(message as never);
      const { result } = renderHook(useSendMessage, context);
      await act(() =>
        result.current.mutateAsync({ chat_id: "c1", type: "text", content: "Hello" })
      );
      expect(context.client.getQueryData(["messages", "c1"])).toMatchObject({
        pages: pages.length ? [{ data: [message] }] : [],
      });
    }
  );
  it("reconciles a matching search result without duplicating a chat on a later list page", async () => {
    const chat = { id: "c1", name: "Partner", last_message: null };
    context.client.setQueryData(["chat", "c1"], chat);
    context.client.setQueryData(["chats"], {
      pages: [{ data: [] }, { data: [chat] }],
      pageParams: [],
    });
    context.client.setQueryData(["chats", "Partner"], {
      pages: [{ data: [chat] }],
      pageParams: [],
    });
    vi.mocked(messageService.sendMessage).mockResolvedValue(message as never);
    const { result } = renderHook(useSendMessage, context);
    await act(() => result.current.mutateAsync({ chat_id: "c1", type: "text", content: "Hello" }));
    expect(context.client.getQueryData(["chats"])).toMatchObject({
      pages: [{ data: [] }, { data: [{ id: "c1", last_message: message }] }],
    });
    expect(context.client.getQueryData(["chats", "Partner"])).toMatchObject({
      pages: [{ data: [{ id: "c1", last_message: message }] }],
    });
  });
  it.each([false, true])(
    "does not fabricate history after deleting an uncached message (failure=%s)",
    async (fails) => {
      if (fails)
        vi.mocked(messageService.deleteMessage).mockRejectedValueOnce(new Error("Forbidden"));
      else vi.mocked(messageService.deleteMessage).mockResolvedValueOnce(undefined);
      const { result } = renderHook(useDeleteMessage, context);
      await act(async () => {
        const pending = result.current.mutateAsync({ messageId: "m1", chatId: "c1" });
        if (fails) await expect(pending).rejects.toThrow("Forbidden");
        else await pending;
      });
      expect(context.client.getQueryData(["messages", "c1"])).toBeUndefined();
      expect(context.client.getQueryData(["chats"])).toBeUndefined();
    }
  );

  it("adds a direct conversation to an empty list after its first message", async () => {
    context.client.setQueryData(["chats", undefined], {
      pages: [{ data: [], meta: {} }],
      pageParams: [undefined],
    });
    context.client.setQueryData(["chat", "c1"], {
      id: "c1",
      name: "Partner",
      type: "private",
      last_message: null,
    });
    vi.mocked(messageService.sendMessage).mockResolvedValue(message as never);
    const { result } = renderHook(useSendMessage, context);
    await act(() => result.current.mutateAsync({ chat_id: "c1", type: "text", content: "Hello" }));
    expect(context.client.getQueryData(["chats", undefined])).toMatchObject({
      pages: [{ data: [{ id: "c1", last_message: message }] }],
    });
  });

  it("does not insert a new conversation into unrelated search results", async () => {
    const filtered = { pages: [{ data: [], meta: {} }], pageParams: [undefined] };
    context.client.setQueryData(["chats", "Someone else"], filtered);
    context.client.setQueryData(["chat", "c1"], { id: "c1", name: "Partner", type: "private" });
    vi.mocked(messageService.sendMessage).mockResolvedValue(message as never);
    const { result } = renderHook(useSendMessage, context);
    await act(() => result.current.mutateAsync({ chat_id: "c1", type: "text", content: "Hello" }));
    expect(context.client.getQueryData(["chats", "Someone else"])).toEqual(filtered);
  });

  it("appends a sent message without overwriting older pages or unrelated chats", async () => {
    const next = { ...message, id: "m2", content: "Second" };
    context.client.setQueryData(["messages", "c1"], infinite());
    context.client.setQueryData(["messages", "other"], infinite([]));
    vi.mocked(messageService.sendMessage).mockResolvedValue(next as never);
    const { result } = renderHook(useSendMessage, context);
    await act(() => result.current.mutateAsync({ chat_id: "c1", type: "text", content: "Second" }));
    expect(context.client.getQueryData(["messages", "c1"])).toEqual(infinite([message, next]));
    expect(context.client.getQueryData(["messages", "other"])).toEqual(infinite([]));
    expect(context.client.getQueryData(["chat", "c1"])).toBeUndefined();
  });

  it("optimistically tombstones a deleted message and updates its sidebar preview", async () => {
    context.client.setQueryData(["messages", "c1"], infinite([message, { ...message, id: "m2" }]));
    context.client.setQueryData(["chats"], {
      pages: [
        {
          data: [
            { id: "c1", last_message: message },
            { id: "other", last_message: message },
          ],
        },
      ],
      pageParams: [],
    });
    vi.mocked(messageService.deleteMessage).mockResolvedValue(undefined);
    const { result } = renderHook(useDeleteMessage, context);
    await act(() => result.current.mutateAsync({ messageId: "m1", chatId: "c1" }));
    expect(context.client.getQueryData(["messages", "c1"])).toMatchObject({
      pages: [
        {
          data: [
            { id: "m1", deleted_at: expect.any(String) },
            { id: "m2", content: "Hello" },
          ],
        },
      ],
    });
    expect(context.client.getQueryData(["chats"])).toMatchObject({
      pages: [
        {
          data: [
            { id: "c1", last_message: { deleted_at: expect.any(String) } },
            { id: "other", last_message: message },
          ],
        },
      ],
    });
    expect(messageService.deleteMessage).toHaveBeenCalledWith("m1");
  });

  it("restores the exact message window after a rejected deletion", async () => {
    context.client.setQueryData(["messages", "c1"], infinite());
    vi.mocked(messageService.deleteMessage).mockRejectedValue(new Error("Forbidden"));
    const { result } = renderHook(useDeleteMessage, context);
    await act(async () => {
      await expect(result.current.mutateAsync({ messageId: "m1", chatId: "c1" })).rejects.toThrow(
        "Forbidden"
      );
    });
    expect(context.client.getQueryData(["messages", "c1"])).toEqual(infinite());
  });
});
