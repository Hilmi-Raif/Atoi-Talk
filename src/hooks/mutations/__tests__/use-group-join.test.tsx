import { toast } from "@/lib/toast";
import { chatService, messageService } from "@/services";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useJoinGroup } from "../use-group-join";

vi.mock("@/services", () => ({
  chatService: { joinGroup: vi.fn() },
  messageService: { getMessages: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

const group = { id: "g1", type: "group", name: "Engineering", member_count: 3 };
const other = { ...group, id: "g2", name: "Design" };
const list = {
  pages: [{ data: [other, { ...group, name: "Old name" }], meta: {} }],
  pageParams: [undefined],
};
const history = { data: [{ id: "m1", content: "Welcome" }], meta: { has_next: false } };

describe("joining a group reconciles real query caches", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(chatService.joinGroup).mockResolvedValue(group as never);
    vi.mocked(messageService.getMessages).mockResolvedValue(history as never);
  });
  afterEach(() => context.client.clear());

  it("prefetches history, seeds details and promotes the joined group without duplicating it", async () => {
    context.client.setQueryData(["chats"], list);
    context.client.setQueryData(["chats", "Engineering"], list);
    const { result } = renderHook(useJoinGroup, context);
    await act(() => result.current.mutateAsync(group.id));
    expect(messageService.getMessages).toHaveBeenCalledWith(
      group.id,
      { limit: 30, cursor: undefined },
      expect.any(AbortSignal)
    );
    expect(context.client.getQueryData(["messages", group.id])).toMatchObject({ pages: [history] });
    expect(context.client.getQueryData(["chat", group.id])).toEqual(group);
    for (const key of [["chats"], ["chats", "Engineering"]]) {
      expect(context.client.getQueryData<typeof list>(key)?.pages[0].data).toEqual([group, other]);
    }
    expect(toast.success).toHaveBeenCalledWith("Joined group successfully");
  });

  it("marks only the matching public group as joined across result pages", async () => {
    const publicGroups = {
      pages: [
        {
          data: [
            { chat_id: "g1", is_member: false },
            { chat_id: "g2", is_member: false },
          ],
        },
        { data: [{ chat_id: "g3", is_member: true }] },
      ],
      pageParams: [undefined, "next"],
    };
    context.client.setQueryData(["public-groups", "eng"], publicGroups);
    const { result } = renderHook(useJoinGroup, context);
    await act(() => result.current.mutateAsync(group.id));
    expect(
      context.client.getQueryData<typeof publicGroups>(["public-groups", "eng"])?.pages
    ).toEqual([
      {
        data: [
          { chat_id: "g1", is_member: true },
          { chat_id: "g2", is_member: false },
        ],
      },
      publicGroups.pages[1],
    ]);
  });

  it("does not turn an acknowledged join into a failure when history cannot be prefetched", async () => {
    vi.mocked(messageService.getMessages).mockRejectedValue(new Error("History unavailable"));
    const { result } = renderHook(useJoinGroup, context);
    await act(async () => expect(await result.current.mutateAsync(group.id)).toEqual(group));
    expect(context.client.getQueryData(["chat", group.id])).toEqual(group);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("invalidates chat lists without fabricating details when the server returns no chat", async () => {
    vi.mocked(chatService.joinGroup).mockResolvedValue(null as never);
    context.client.setQueryData(["chats"], list);
    const { result } = renderHook(useJoinGroup, context);
    await act(() => result.current.mutateAsync(group.id));
    expect(context.client.getQueryState(["chats"])?.isInvalidated).toBe(true);
    expect(context.client.getQueryData(["chats"])).toEqual(list);
    expect(context.client.getQueryData(["chat", group.id])).toBeUndefined();
    expect(messageService.getMessages).not.toHaveBeenCalled();
  });

  it("preserves empty and incomplete lists and safely normalizes malformed public results", async () => {
    context.client.setQueryData(["chats", "empty"], { pages: [], pageParams: [] });
    context.client.setQueryData(["chats", "incomplete"], { pageParams: [] });
    context.client.setQueryData(["public-groups", "empty"], {
      pages: [{ data: null }],
      pageParams: [],
    });
    context.client.setQueryData(["public-groups", "incomplete"], { pageParams: [] });
    const { result } = renderHook(useJoinGroup, context);
    await act(() => result.current.mutateAsync(group.id));
    expect(context.client.getQueryData(["chats", "empty"])).toEqual({ pages: [], pageParams: [] });
    expect(context.client.getQueryData(["chats", "incomplete"])).toEqual({ pageParams: [] });
    expect(context.client.getQueryData(["public-groups", "empty"])).toEqual({
      pages: [{ data: [] }],
      pageParams: [],
    });
    expect(context.client.getQueryData(["public-groups", "incomplete"])).toEqual({
      pageParams: [],
    });
  });

  it.each(["Group is full", undefined])(
    "preserves caches when joining is rejected (%s)",
    async (error) => {
      vi.mocked(chatService.joinGroup).mockRejectedValue({ response: { data: { error } } });
      context.client.setQueryData(["chats"], list);
      const { result } = renderHook(useJoinGroup, context);
      await act(async () => {
        await expect(result.current.mutateAsync(group.id)).rejects.toBeDefined();
      });
      expect(context.client.getQueryData(["chats"])).toEqual(list);
      expect(messageService.getMessages).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(error || "Failed to join group");
    }
  );
});
