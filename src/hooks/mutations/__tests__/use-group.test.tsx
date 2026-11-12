import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { useChatStore } from "@/store";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import {
  useAddGroupMember,
  useCreateGroup,
  useDeleteGroup,
  useKickGroupMember,
  useLeaveGroup,
  useResetInviteCode,
  useTransferOwnership,
  useUpdateGroup,
  useUpdateMemberRole,
} from "../use-group";

vi.mock("@/services", () => ({
  chatService: {
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    leaveGroup: vi.fn(),
    deleteGroup: vi.fn(),
    addGroupMember: vi.fn(),
    kickGroupMember: vi.fn(),
    updateMemberRole: vi.fn(),
    transferOwnership: vi.fn(),
    resetGroupInviteCode: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

const group = {
  id: "group-1",
  type: "group",
  name: "Engineering",
  avatar: null,
  unread_count: 0,
  last_read_at: null,
  last_message: null,
  member_count: 3,
  invite_code: "old-code",
};
const other = { ...group, id: "group-2", name: "Design" };
const paged = (data: unknown[]) => ({
  pages: [{ data }, { data: [] }],
  pageParams: [null, "next"],
});

describe("group mutation cache consistency", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    useChatStore.getState().reset();
    context = createQueryWrapper();
    context.client.setQueryData(["chats"], paged([group, other]));
    context.client.setQueryData(["chats", "search"], paged([group]));
    context.client.setQueryData(["chat", group.id], group);
  });
  afterEach(() => {
    context.client.clear();
    vi.useRealTimers();
  });

  function cachedChats() {
    return context.client.getQueryData<ReturnType<typeof paged>>(["chats"])!.pages[0].data;
  }

  it.each(["Short", "A group name longer than twenty characters", ""])(
    "uses the cached or fallback name when deleting %s without an explicit name",
    async (name) => {
      vi.useFakeTimers();
      context.client.setQueryData(["chats"], paged([{ ...group, name }, other]));
      context.client.removeQueries({ queryKey: ["chats", "search"] });
      vi.mocked(chatService.deleteGroup).mockResolvedValue(undefined);
      const { result } = renderHook(() => useDeleteGroup(), context);
      await act(async () => {
        await result.current.mutateAsync({ chatId: group.id });
      });
      expect(cachedChats()).toEqual([other]);
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining(
          name ? (name.length > 20 ? name.slice(0, 20) + "..." : name) : "Group"
        )
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(context.client.getQueryData(["chat", group.id])).toBeUndefined();
    }
  );

  it.each(["A group name longer than twenty characters", ""])(
    "leaves %s while preserving an unrelated active conversation and malformed discovery pages",
    async (name) => {
      vi.useFakeTimers();
      useChatStore.getState().setActiveChatId(other.id);
      context.client.setQueryData(["chats"], paged([{ ...group, name }, other]));
      context.client.removeQueries({ queryKey: ["chats", "search"] });
      context.client.setQueryData(["public-groups"], { pages: [{ data: null }], pageParams: [] });
      vi.mocked(chatService.leaveGroup).mockResolvedValue(undefined);
      const { result } = renderHook(() => useLeaveGroup(), context);
      await act(async () => {
        await result.current.mutateAsync(group.id);
      });
      expect(useChatStore.getState().activeChatId).toBe(other.id);
      expect(toast.success).toHaveBeenCalledWith(
        `Left "${name ? name.slice(0, 20) + "..." : "Group"}"`
      );
      expect(context.client.getQueryData(["public-groups"])).toMatchObject({
        pages: [{ data: [] }],
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }
  );

  it("creates a group without fabricating a sidebar page when its cached page list is empty", async () => {
    context.client.setQueryData(["chats"], { pages: [], pageParams: [] });
    vi.mocked(chatService.createGroup).mockResolvedValue(group as never);
    const { result } = renderHook(() => useCreateGroup(), context);
    await act(async () => {
      await result.current.mutateAsync({
        name: "Engineering",
        member_ids: ["u2"],
        is_public: false,
      });
    });
    expect(context.client.getQueryData(["chats"])).toEqual({ pages: [], pageParams: [] });
    expect(context.client.getQueryData(["chat", group.id])).toEqual(group);
  });

  it.each(["add", "kick"] as const)(
    "handles an unknown member count without going negative (%s)",
    async (operation) => {
      const unknown = { ...group, member_count: undefined };
      context.client.setQueryData(["chat", group.id], unknown);
      context.client.setQueryData(["chats"], paged([unknown, other]));
      vi.mocked(chatService.addGroupMember).mockResolvedValue({} as never);
      vi.mocked(chatService.kickGroupMember).mockResolvedValue({} as never);
      const { result } = renderHook(
        () => ({ add: useAddGroupMember(), kick: useKickGroupMember() }),
        context
      );
      await act(async () => {
        if (operation === "add")
          await result.current.add.mutateAsync({ chatId: group.id, userIds: ["u2"] });
        else await result.current.kick.mutateAsync({ chatId: group.id, userId: "u2" });
      });
      const count = operation === "add" ? 1 : 0;
      expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
        member_count: count,
      });
      expect(cachedChats()).toEqual([{ ...unknown, member_count: count }, other]);
    }
  );

  it.each(["add", "kick", "role", "transfer", "invite"] as const)(
    "does not fabricate a missing detail cache after %s succeeds",
    async (operation) => {
      context.client.clear();
      vi.mocked(chatService.addGroupMember).mockResolvedValue({} as never);
      vi.mocked(chatService.kickGroupMember).mockResolvedValue({} as never);
      vi.mocked(chatService.updateMemberRole).mockResolvedValue({} as never);
      vi.mocked(chatService.transferOwnership).mockResolvedValue({} as never);
      vi.mocked(chatService.resetGroupInviteCode).mockResolvedValue({ code: "fresh" } as never);
      const { result } = renderHook(
        () => ({
          add: useAddGroupMember(),
          kick: useKickGroupMember(),
          role: useUpdateMemberRole(),
          transfer: useTransferOwnership(),
          invite: useResetInviteCode(),
        }),
        context
      );
      await act(async () => {
        if (operation === "add")
          await result.current.add.mutateAsync({ chatId: group.id, userIds: ["u2"] });
        if (operation === "kick")
          await result.current.kick.mutateAsync({ chatId: group.id, userId: "u2" });
        if (operation === "role")
          await result.current.role.mutateAsync({ chatId: group.id, userId: "u2", role: "admin" });
        if (operation === "transfer")
          await result.current.transfer.mutateAsync({ chatId: group.id, newOwnerId: "u2" });
        if (operation === "invite") await result.current.invite.mutateAsync(group.id);
      });
      expect(context.client.getQueryData(["chat", group.id])).toBeUndefined();
      expect(context.client.getQueryData(["chats"])).toBeUndefined();
      expect(toast.success).toHaveBeenCalled();
    }
  );

  it.each(["role", "transfer"] as const)(
    "reports server validation and transport failures without changing members (%s)",
    async (operation) => {
      const members = paged([{ user_id: "u2", role: "member" }]);
      context.client.setQueryData(["group-members", "infinite", group.id], members);
      const service =
        operation === "role" ? chatService.updateMemberRole : chatService.transferOwnership;
      const { result } = renderHook(
        () => ({ role: useUpdateMemberRole(), transfer: useTransferOwnership() }),
        context
      );
      for (const [failure, expected] of [
        [
          { isAxiosError: true, response: { status: 400, data: { error: "Not permitted" } } },
          "Not permitted",
        ],
        [
          { isAxiosError: true, response: { status: 400, data: {} } },
          operation === "role" ? "Role update failed" : "Transfer failed",
        ],
        [
          new Error("offline"),
          operation === "role" ? "Failed to update role" : "Failed to transfer ownership",
        ],
      ] as const) {
        vi.mocked(service).mockRejectedValueOnce(failure);
        await act(async () => {
          const request =
            operation === "role"
              ? result.current.role.mutateAsync({ chatId: group.id, userId: "u2", role: "admin" })
              : result.current.transfer.mutateAsync({ chatId: group.id, newOwnerId: "u2" });
          await expect(request).rejects.toEqual(failure);
        });
        expect(toast.error).toHaveBeenLastCalledWith(expected);
        expect(context.client.getQueryData(["group-members", "infinite", group.id])).toEqual(
          members
        );
      }
    }
  );

  it("creates a group without duplicate sidebar entries and seeds its messages", async () => {
    const created = { ...group, name: "New Engineering", last_message: { id: "welcome" } };
    vi.mocked(chatService.createGroup).mockResolvedValue(created as never);
    const { result } = renderHook(useCreateGroup, context);
    await act(() => result.current.mutateAsync({ name: "New Engineering", user_ids: [] } as never));
    expect(cachedChats()).toEqual([created, other]);
    expect(context.client.getQueryData(["chat", group.id])).toEqual(created);
    expect(context.client.getQueryData(["messages", group.id])).toMatchObject({
      pages: [{ data: [{ id: "welcome" }], meta: { has_next: false, has_prev: false } }],
    });
  });

  it("seeds an empty message page when a created group has no system message", async () => {
    vi.mocked(chatService.createGroup).mockResolvedValue(group as never);
    context.client.clear();
    const { result } = renderHook(useCreateGroup, context);
    await act(() => result.current.mutateAsync({ name: "Engineering" } as never));
    expect(context.client.getQueryData(["messages", group.id])).toMatchObject({
      pages: [{ data: [] }],
    });
  });

  it("updates matching chat variants while preserving an omitted invite code", async () => {
    vi.mocked(chatService.updateGroup).mockResolvedValue({ name: "Renamed" } as never);
    const { result } = renderHook(useUpdateGroup, context);
    await act(() => result.current.mutateAsync({ groupId: group.id, data: { name: "Renamed" } }));
    expect(cachedChats()).toEqual([{ ...group, name: "Renamed" }, other]);
    expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
      name: "Renamed",
      invite_code: "old-code",
    });
  });

  it("accepts a rotated invite code from the backend compatibility field", async () => {
    vi.mocked(chatService.updateGroup).mockResolvedValue({
      name: "Renamed",
      code: "rotated",
    } as never);
    const { result } = renderHook(useUpdateGroup, context);
    await act(() => result.current.mutateAsync({ groupId: group.id, data: { name: "Renamed" } }));
    expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
      invite_code: "rotated",
    });
  });

  it("leaves a group, clears the active selection and marks public discovery as not joined", async () => {
    vi.mocked(chatService.leaveGroup).mockResolvedValue(undefined as never);
    useChatStore.getState().setActiveChatId(group.id);
    context.client.setQueryData(
      ["public-groups"],
      paged([
        { chat_id: group.id, is_member: true },
        { chat_id: other.id, is_member: true },
      ])
    );
    context.client.setQueryData(["messages", group.id], paged([{ id: "m1" }]));
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useLeaveGroup(callback), context);
    await act(() => result.current.mutateAsync(group.id));
    expect(callback).toHaveBeenCalledWith(group.id);
    expect(useChatStore.getState().activeChatId).toBeNull();
    expect(cachedChats()).toEqual([other]);
    expect(context.client.getQueryData(["public-groups"])).toMatchObject({
      pages: [
        {
          data: [
            { chat_id: group.id, is_member: false },
            { chat_id: other.id, is_member: true },
          ],
        },
        { data: [] },
      ],
    });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(context.client.getQueryData(["messages", group.id])).toBeUndefined();
  });

  it("rolls back optimistic deletion when the server rejects it", async () => {
    vi.mocked(chatService.deleteGroup).mockRejectedValue(new Error("Forbidden"));
    const { result } = renderHook(useDeleteGroup, context);
    await act(async () => {
      await expect(result.current.mutateAsync({ chatId: group.id })).rejects.toThrow("Forbidden");
    });
    expect(useChatStore.getState().recentlyDeletedChatIds.has(group.id)).toBe(false);
    expect(cachedChats()).toEqual([group, other]);
  });

  it("removes a successfully deleted group from every sidebar cache", async () => {
    vi.mocked(chatService.deleteGroup).mockResolvedValue(undefined as never);
    vi.useFakeTimers();
    const { result } = renderHook(useDeleteGroup, context);
    await act(() => result.current.mutateAsync({ chatId: group.id, name: group.name }));
    expect(cachedChats()).toEqual([other]);
    expect(useChatStore.getState().recentlyDeletedChatIds.has(group.id)).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(context.client.getQueryData(["chat", group.id])).toBeUndefined();
  });

  it.each([8, undefined])(
    "uses authoritative member count %s or increments locally after adding",
    async (member_count) => {
      vi.mocked(chatService.addGroupMember).mockResolvedValue({ member_count } as never);
      const { result } = renderHook(useAddGroupMember, context);
      await act(() => result.current.mutateAsync({ chatId: group.id, userIds: ["u4", "u5"] }));
      const expected = member_count ?? 5;
      expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
        member_count: expected,
      });
      expect(cachedChats()).toEqual([{ ...group, member_count: expected }, other]);
    }
  );

  it.each([1, undefined])(
    "uses authoritative member count %s or decrements locally after removal",
    async (member_count) => {
      vi.mocked(chatService.kickGroupMember).mockResolvedValue({ member_count } as never);
      const { result } = renderHook(useKickGroupMember, context);
      await act(() => result.current.mutateAsync({ chatId: group.id, userId: "u3" }));
      expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
        member_count: member_count ?? 2,
      });
      expect(cachedChats()).toEqual([{ ...group, member_count: member_count ?? 2 }, other]);
    }
  );

  it("changes only the selected member role across paginated member caches", async () => {
    vi.mocked(chatService.updateMemberRole).mockResolvedValue(undefined as never);
    context.client.setQueryData(
      ["group-members", "infinite", group.id],
      paged([
        { user_id: "u1", role: "member" },
        { user_id: "u2", role: "member" },
      ])
    );
    const { result } = renderHook(useUpdateMemberRole, context);
    await act(() => result.current.mutateAsync({ chatId: group.id, userId: "u2", role: "admin" }));
    expect(context.client.getQueryData(["group-members", "infinite", group.id])).toMatchObject({
      pages: [
        {
          data: [
            { user_id: "u1", role: "member" },
            { user_id: "u2", role: "admin" },
          ],
        },
        { data: [] },
      ],
    });
  });

  it("marks the new owner without rewriting unrelated members", async () => {
    vi.mocked(chatService.transferOwnership).mockResolvedValue(undefined as never);
    context.client.setQueryData(
      ["group-members", "infinite", group.id],
      paged([
        { user_id: "u2", role: "admin" },
        { user_id: "u3", role: "member" },
      ])
    );
    const { result } = renderHook(useTransferOwnership, context);
    await act(() => result.current.mutateAsync({ chatId: group.id, newOwnerId: "u2" }));
    expect(context.client.getQueryData(["group-members", "infinite", group.id])).toMatchObject({
      pages: [
        {
          data: [
            { user_id: "u2", role: "owner" },
            { user_id: "u3", role: "member" },
          ],
        },
        { data: [] },
      ],
    });
  });

  it("immediately removes the former owner's controls and demotes their member record", async () => {
    vi.mocked(chatService.transferOwnership).mockResolvedValue(undefined as never);
    context.client.setQueryData(["chat", group.id], { ...group, my_role: "owner" });
    context.client.setQueryData(["chats"], paged([{ ...group, my_role: "owner" }, other]));
    context.client.setQueryData(
      ["group-members", "infinite", group.id],
      paged([
        { user_id: "u1", role: "owner" },
        { user_id: "u2", role: "member" },
      ])
    );
    const { result } = renderHook(useTransferOwnership, context);
    await act(() => result.current.mutateAsync({ chatId: group.id, newOwnerId: "u2" }));
    expect(context.client.getQueryData(["chat", group.id])).toMatchObject({ my_role: "admin" });
    expect(cachedChats()).toEqual([{ ...group, my_role: "admin" }, other]);
    expect(context.client.getQueryData(["group-members", "infinite", group.id])).toMatchObject({
      pages: [
        {
          data: [
            { user_id: "u1", role: "admin" },
            { user_id: "u2", role: "owner" },
          ],
        },
        { data: [] },
      ],
    });
  });

  it("rotates invite links in detail and all sidebar caches", async () => {
    vi.mocked(chatService.resetGroupInviteCode).mockResolvedValue({ code: "new-code" } as never);
    const { result } = renderHook(useResetInviteCode, context);
    await act(() => result.current.mutateAsync(group.id));
    expect(context.client.getQueryData(["chat", group.id])).toMatchObject({
      invite_code: "new-code",
    });
    expect(cachedChats()).toEqual([{ ...group, invite_code: "new-code" }, other]);
  });
});
