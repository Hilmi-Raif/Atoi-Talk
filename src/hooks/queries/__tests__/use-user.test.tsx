import { userService } from "@/services";
import { useAuthStore } from "@/store";
import type { User } from "@/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import {
  useBlockedUsers,
  useCurrentUser,
  useSearchUsers,
  useUpdateProfile,
  useUserById,
} from "../use-user";

vi.mock("@/services", () => ({
  userService: {
    getCurrentUser: vi.fn(),
    getUserById: vi.fn(),
    updateProfile: vi.fn(),
    searchUsers: vi.fn(),
    getBlockedUsers: vi.fn(),
  },
}));

const user: User = {
  id: "u1",
  email: "person@example.com",
  full_name: "Test Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
};

describe("user queries and profile cache", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.getState().logout();
    context = createQueryWrapper();
  });
  afterEach(() => context.client.clear());

  it("does not fetch the current user until a session exists", async () => {
    vi.mocked(userService.getCurrentUser).mockResolvedValue(user);
    const { result } = renderHook(useCurrentUser, context);
    expect(result.current.fetchStatus).toBe("idle");
    expect(userService.getCurrentUser).not.toHaveBeenCalled();
    act(() => useAuthStore.getState().setCredentials("jwt", user));
    await waitFor(() => expect(result.current.data).toEqual(user));
    expect(userService.getCurrentUser).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it.each([null, "u1"])("respects disabled profile queries for id %s", (id) => {
    const { result } = renderHook(() => useUserById(id, { enabled: false }), context);
    expect(result.current.fetchStatus).toBe("idle");
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it("uses initial profile data without an unnecessary request", () => {
    const { result } = renderHook(() => useUserById(user.id, { initialData: user }), context);
    expect(result.current.data).toEqual(user);
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it("fetches a missing profile under its own cache key", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(user);
    const { result } = renderHook(() => useUserById(user.id), context);
    await waitFor(() => expect(result.current.data).toEqual(user));
    expect(userService.getUserById).toHaveBeenCalledWith(user.id, expect.any(AbortSignal));
    expect(context.client.getQueryData(["user", user.id])).toEqual(user);
    expect(context.client.getQueryData(["user", "current"])).toBeUndefined();
  });

  it("updates the session and current-user cache after profile save", async () => {
    useAuthStore.getState().setCredentials("jwt", user);
    const updated = { ...user, full_name: "New Name", bio: "About me" };
    vi.mocked(userService.updateProfile).mockResolvedValue(updated);
    const { result } = renderHook(useUpdateProfile, context);
    await act(() => result.current.mutateAsync({ full_name: updated.full_name, bio: updated.bio }));
    expect(userService.updateProfile).toHaveBeenCalledWith({
      full_name: "New Name",
      bio: "About me",
    });
    expect(useAuthStore.getState().user).toEqual(updated);
    expect(useAuthStore.getState().token).toBe("jwt");
    expect(context.client.getQueryData(["user", "current"])).toEqual(updated);
  });

  it("preserves the previous profile when saving fails", async () => {
    useAuthStore.getState().setCredentials("jwt", user);
    context.client.setQueryData(["user", "current"], user);
    vi.mocked(userService.updateProfile).mockRejectedValue(new Error("Save failed"));
    const { result } = renderHook(useUpdateProfile, context);
    await act(async () => {
      await expect(result.current.mutateAsync({ full_name: "New Name" })).rejects.toThrow(
        "Save failed"
      );
    });
    expect(useAuthStore.getState().user).toEqual(user);
    expect(context.client.getQueryData(["user", "current"])).toEqual(user);
  });

  it("pages user search with the exclusion and chat lookup parameters", async () => {
    const second = { ...user, id: "u2", username: "second" };
    vi.mocked(userService.searchUsers)
      .mockResolvedValueOnce({ data: [user], meta: { has_next: true, next_cursor: "next-users" } })
      .mockResolvedValueOnce({ data: [second], meta: { has_next: false } });
    const { result } = renderHook(
      () => useSearchUsers("person", { excludeChatId: "group-1" }),
      context
    );
    await waitFor(() => expect(result.current.data?.pages[0].data).toEqual([user]));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages.flatMap((page) => page.data)).toEqual([user, second]);
    expect(result.current.hasNextPage).toBe(false);
    expect(userService.searchUsers).toHaveBeenLastCalledWith(
      {
        query: "person",
        cursor: "next-users",
        limit: 20,
        include_chat_id: true,
        exclude_chat_id: "group-1",
      },
      expect.any(AbortSignal)
    );
  });

  it("keeps search queries isolated by excluded chat", async () => {
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [user],
      meta: { has_next: false },
    });
    const { result, rerender } = renderHook(
      ({ chat }) => useSearchUsers("person", { excludeChatId: chat }),
      { ...context, initialProps: { chat: "group-1" } }
    );
    await waitFor(() => expect(result.current.data?.pages[0].data).toEqual([user]));
    rerender({ chat: "group-2" });
    await waitFor(() => expect(userService.searchUsers).toHaveBeenCalledTimes(2));
    expect(userService.searchUsers).toHaveBeenLastCalledWith(
      expect.objectContaining({ exclude_chat_id: "group-2" }),
      expect.any(AbortSignal)
    );
  });

  it("does not search or list blocked users when disabled", () => {
    renderHook(() => useSearchUsers("person", { enabled: false }), context);
    renderHook(() => useBlockedUsers("person", { enabled: false }), context);
    expect(userService.searchUsers).not.toHaveBeenCalled();
    expect(userService.getBlockedUsers).not.toHaveBeenCalled();
  });

  it("paginates blocked users and stops after the last page", async () => {
    vi.mocked(userService.getBlockedUsers)
      .mockResolvedValueOnce({
        data: [user],
        meta: { has_next: true, next_cursor: "blocked-next" },
      })
      .mockResolvedValueOnce({ data: [], meta: { has_next: false } });
    const { result } = renderHook(() => useBlockedUsers("person"), context);
    await waitFor(() => expect(result.current.data?.pages[0].data).toEqual([user]));
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(result.current.data?.pages).toHaveLength(2);
    expect(userService.getBlockedUsers).toHaveBeenLastCalledWith(
      { query: "person", cursor: "blocked-next", limit: 20 },
      expect.any(AbortSignal)
    );
  });
});
