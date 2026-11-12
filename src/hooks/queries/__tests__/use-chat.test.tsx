import { chatService } from "@/services";
import { useChatStore } from "@/store";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useChat, useChats, useCreatePrivateChat, useSearchPublicGroups } from "../use-chat";

vi.mock("@/services", () => ({
  chatService: {
    getChats: vi.fn(),
    getChatById: vi.fn(),
    createPrivateChat: vi.fn(),
    searchPublicGroups: vi.fn(),
  },
}));

const chat = { id: "chat-1", type: "private" as const, name: "Person", last_message: null };
const page = { data: [chat], meta: { has_next: false } };

describe("chat discovery and cache hydration", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    useChatStore.getState().reset();
    context = createQueryWrapper();
  });
  afterEach(() => context.client.clear());

  it("normalizes an empty search and follows the chat cursor", async () => {
    vi.mocked(chatService.getChats)
      .mockResolvedValueOnce({ ...page, meta: { has_next: true, next_cursor: "older" } } as never)
      .mockResolvedValueOnce(page as never);
    const { result } = renderHook(() => useChats({ query: "", limit: 5 }), context);
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(chatService.getChats).toHaveBeenLastCalledWith(
      { query: undefined, limit: 5, cursor: "older" },
      expect.any(AbortSignal)
    );
    expect(context.client.getQueryData(["chats", undefined])).toEqual(result.current.data);
  });

  it("does not fetch disabled lists or a missing chat id", () => {
    renderHook(() => useChats(undefined, { enabled: false }), context);
    const { result } = renderHook(() => useChat(null), context);
    expect(result.current.fetchStatus).toBe("idle");
    expect(chatService.getChats).not.toHaveBeenCalled();
    expect(chatService.getChatById).not.toHaveBeenCalled();
  });

  it("uses fresh exact details ahead of a sidebar entry", () => {
    context.client.setQueryData(["chat", chat.id], { ...chat, name: "Exact details" });
    context.client.setQueryData(["chats", undefined], { pages: [page], pageParams: [undefined] });
    const { result } = renderHook(() => useChat(chat.id), context);
    expect(result.current.data?.name).toBe("Exact details");
    expect(chatService.getChatById).not.toHaveBeenCalled();
  });

  it("hydrates details from any sidebar search page without refetching fresh data", () => {
    context.client.setQueryData(["chats", "Person"], {
      pages: [{ data: [], meta: {} }, page],
      pageParams: [undefined, "next"],
    });
    const { result } = renderHook(() => useChat(chat.id), context);
    expect(result.current.data).toEqual(chat);
    expect(chatService.getChatById).not.toHaveBeenCalled();
  });

  it("refreshes suspicious group entries with no member count", async () => {
    const group = { ...chat, type: "group", member_count: 0 };
    const updated = { ...group, member_count: 3 };
    context.client.setQueryData(["chats", undefined], {
      pages: [{ data: [group], meta: {} }],
      pageParams: [undefined],
    });
    vi.mocked(chatService.getChatById).mockResolvedValue(updated as never);
    const { result } = renderHook(() => useChat(chat.id), context);
    await waitFor(() => expect(result.current.data?.member_count).toBe(3));
    expect(chatService.getChatById).toHaveBeenCalledWith(chat.id, expect.any(AbortSignal));
  });

  it.each([400, 403, 404])("does not retry permanent detail errors (%s)", async (status) => {
    vi.mocked(chatService.getChatById).mockRejectedValue({ response: { status } });
    const { result } = renderHook(() => useChat(chat.id), context);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(chatService.getChatById).toHaveBeenCalledTimes(1);
  });

  it("fetches newly created chat details, seeds an empty history and selects it", async () => {
    vi.mocked(chatService.createPrivateChat).mockResolvedValue({ id: chat.id } as never);
    vi.mocked(chatService.getChatById).mockResolvedValue(chat as never);
    const { result } = renderHook(useCreatePrivateChat, context);
    await act(() => result.current.mutateAsync({ target_user_id: "u2" }));
    expect(chatService.createPrivateChat).toHaveBeenCalledWith({ target_user_id: "u2" });
    expect(context.client.getQueryData(["chat", chat.id])).toEqual(chat);
    expect(context.client.getQueryData(["messages", chat.id])).toMatchObject({
      pages: [{ data: [], meta: { has_next: false, has_prev: false } }],
    });
    expect(useChatStore.getState().activeChatId).toBe(chat.id);
  });

  it("preserves existing message history when reopening a private chat", async () => {
    const history = {
      pages: [{ data: [{ id: "m1", content: "Keep me" }], meta: {} }],
      pageParams: [undefined],
    };
    context.client.setQueryData(["messages", chat.id], history);
    vi.mocked(chatService.createPrivateChat).mockResolvedValue({ id: chat.id } as never);
    vi.mocked(chatService.getChatById).mockResolvedValue(chat as never);
    const { result } = renderHook(useCreatePrivateChat, context);
    await act(() => result.current.mutateAsync({ target_user_id: "u2" }));
    expect(context.client.getQueryData(["messages", chat.id])).toEqual(history);
  });

  it("does not seed an empty history when the chat already has a message", async () => {
    vi.mocked(chatService.createPrivateChat).mockResolvedValue({ id: chat.id } as never);
    vi.mocked(chatService.getChatById).mockResolvedValue({
      ...chat,
      last_message: { id: "m1" },
    } as never);
    const { result } = renderHook(useCreatePrivateChat, context);
    await act(() => result.current.mutateAsync({ target_user_id: "u2" }));
    expect(context.client.getQueryData(["messages", chat.id])).toBeUndefined();
  });

  it("does not select a chat when creation fails", async () => {
    vi.mocked(chatService.createPrivateChat).mockRejectedValue(new Error("Not allowed"));
    const { result } = renderHook(useCreatePrivateChat, context);
    await act(async () => {
      await expect(result.current.mutateAsync({ target_user_id: "u2" })).rejects.toThrow(
        "Not allowed"
      );
    });
    expect(useChatStore.getState().activeChatId).toBeNull();
    expect(chatService.getChatById).not.toHaveBeenCalled();
  });

  it("paginates public-group search with its sort order", async () => {
    vi.mocked(chatService.searchPublicGroups)
      .mockResolvedValueOnce({ ...page, meta: { has_next: true, next_cursor: "next" } } as never)
      .mockResolvedValueOnce(page as never);
    const { result } = renderHook(
      () => useSearchPublicGroups("engineering", { sortBy: "members" }),
      context
    );
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(chatService.searchPublicGroups).toHaveBeenLastCalledWith(
      { query: "engineering", cursor: "next", limit: 20, sort_by: "members" },
      expect.any(AbortSignal)
    );
  });

  it("does not request disabled public-group searches", () => {
    renderHook(() => useSearchPublicGroups("engineering", { enabled: false }), context);
    expect(chatService.searchPublicGroups).not.toHaveBeenCalled();
  });
});
