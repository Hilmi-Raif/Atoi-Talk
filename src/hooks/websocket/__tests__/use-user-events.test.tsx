import { userService } from "@/services/user.service";
import { useAuthStore, useChatStore } from "@/store";
import type { ChatListItem, User } from "@/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useUserEvents } from "../use-user-events";

vi.mock("@/services/user.service", () => ({ userService: { getUserById: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const user: User = {
  id: "u1",
  email: "person@example.com",
  full_name: "Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
};
const partner: User = { ...user, id: "u2", full_name: "Partner" };
const privateChat: ChatListItem = {
  id: "c1",
  type: "private",
  name: "Partner",
  avatar: "old.png",
  other_user_id: "u2",
  unread_count: 3,
  last_message: null,
  last_read_at: null,
  other_last_read_at: null,
  is_online: false,
};
const group = { ...privateChat, id: "group", type: "group" as const };
const seed = () => ({
  pages: [{ data: [privateChat, group], meta: { has_next: false } }],
  pageParams: [undefined],
});

describe("user WebSocket cache reconciliation", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    useChatStore.getState().reset();
    useAuthStore.getState().setCredentials("jwt", user);
    context.client.setQueryData(["chats"], seed());
    context.client.setQueryData(["chat", "c1"], privateChat);
    context.client.setQueryData(["chat", "group"], group);
    context.client.setQueryData(["user", "u2"], partner);
    context.client.setQueryData(["user", "current"], user);
  });
  afterEach(() => {
    context.client.clear();
    useAuthStore.getState().logout();
  });
  const setup = (current: User | null = user) =>
    renderHook(
      () =>
        useUserEvents(
          current,
          useChatStore.getState().setUserOnline,
          useChatStore.getState().clearUserTypingGlobal
        ),
      context
    );
  const chats = () =>
    context.client.getQueryData<ReturnType<typeof seed>>(["chats"])!.pages[0].data;

  it("updates presence and identity without fabricating unloaded query data", () => {
    context.client.clear();
    const { result } = setup();
    act(() => {
      result.current.handleUserOnlineStatus({ user_id: "u2" }, true);
      result.current.handleUserUpdate({ id: "u2", full_name: "Updated partner" });
      result.current.handleUserBanDelete({ type: "user.banned", payload: { user_id: "u2" } });
      result.current.handleUserUnbanned({ payload: { user_id: "u2" } });
    });
    expect(context.client.getQueryData(["chats"])).toBeUndefined();
    expect(context.client.getQueryData(["user", "u2"])).toBeUndefined();
    expect(useChatStore.getState().onlineUsers.has("u2")).toBe(true);
  });

  it.each(["user.banned", "user.deleted", "user.unbanned"])(
    "preserves absent detail queries while applying %s to a cached sidebar",
    (type) => {
      context.client.removeQueries({ queryKey: ["chat", "c1"] });
      const { result } = setup();
      act(() => {
        const event = { type, payload: { user_id: "u2" } };
        if (type === "user.unbanned") result.current.handleUserUnbanned(event);
        else result.current.handleUserBanDelete(event);
      });
      expect(context.client.getQueryData(["chat", "c1"])).toBeUndefined();
      expect(chats()[0]).toMatchObject({ other_user_is_banned: type === "user.banned" });
      expect(chats()[1]).toEqual(group);
    }
  );

  it.each([null, "2026-01-02T12:00:00Z"])(
    "reconciles an explicit last-seen update without clearing omitted member fields (%s)",
    (lastSeen) => {
      const member = {
        user_id: "u2",
        full_name: "Partner",
        username: "partner",
        avatar: "old.png",
      };
      context.client.setQueryData(["group-members", "infinite", "group"], {
        pages: [{ data: [member] }],
        pageParams: [undefined],
      });
      const { result } = setup(null);
      act(() => result.current.handleUserUpdate({ id: "u2", last_seen_at: lastSeen }));
      expect(context.client.getQueryData(["chat", "c1"])).toMatchObject({
        name: "Partner",
        avatar: "old.png",
        is_online: !!lastSeen,
      });
      expect(context.client.getQueryData(["group-members", "infinite", "group"])).toMatchObject({
        pages: [{ data: [member] }],
      });
      expect(useAuthStore.getState().user).toEqual(user);
    }
  );

  it("does not fabricate the missing current-user query while updating the signed-in profile", () => {
    context.client.removeQueries({ queryKey: ["user", "current"] });
    const { result } = setup();
    act(() => result.current.handleUserUpdate({ id: user.id, full_name: "Updated locally" }));
    expect(context.client.getQueryData(["user", "current"])).toBeUndefined();
    expect(useAuthStore.getState().user?.full_name).toBe("Updated locally");
  });

  it.each([true, false])(
    "updates presence in the store, partner list and profile (%s)",
    (online) => {
      const { result } = setup();
      act(() => result.current.handleUserOnlineStatus({ user_id: "u2" }, online));
      expect(chats()[0].is_online).toBe(online);
      expect(chats()[1]).toEqual(group);
      expect(context.client.getQueryData<User>(["user", "u2"])).toMatchObject({
        is_online: online,
        last_seen_at: expect.any(String),
      });
      expect(useChatStore.getState().onlineUsers.has("u2")).toBe(online);
    }
  );

  it("reconciles a renamed partner and explicitly cleared avatar across profiles, chats and members", () => {
    const members = {
      pages: [
        {
          data: [
            { user_id: "u2", full_name: "Partner", username: "old", avatar: "old.png" },
            { user_id: "u3", full_name: "Untouched" },
          ],
        },
      ],
      pageParams: [undefined],
    };
    context.client.setQueryData(["group-members", "infinite", "group"], members);
    const { result } = setup();
    act(() =>
      result.current.handleUserUpdate({
        id: "u2",
        full_name: "Renamed",
        avatar: null,
        username: "newname",
      })
    );
    expect(chats()[0]).toMatchObject({ name: "Renamed", avatar: null, unread_count: 3 });
    expect(chats()[1]).toEqual(group);
    expect(context.client.getQueryData(["chat", "c1"])).toMatchObject({
      name: "Renamed",
      avatar: null,
    });
    expect(context.client.getQueryData(["user", "u2"])).toMatchObject({
      full_name: "Renamed",
      avatar: null,
      username: "newname",
    });
    expect(
      context.client.getQueryData<typeof members>(["group-members", "infinite", "group"])?.pages[0]
        .data
    ).toEqual([
      { ...members.pages[0].data[0], full_name: "Renamed", avatar: null, username: "newname" },
      members.pages[0].data[1],
    ]);
    expect(useAuthStore.getState().user).toEqual(user);
  });

  it("preserves omitted partner fields", () => {
    const { result } = setup();
    act(() => result.current.handleUserUpdate({ id: "u2", bio: "Changed biography" }));
    expect(chats()[0]).toEqual(privateChat);
    expect(context.client.getQueryData(["chat", "c1"])).toEqual(privateChat);
    expect(context.client.getQueryData(["user", "u2"])).toMatchObject({
      bio: "Changed biography",
      full_name: "Partner",
    });
  });

  it("syncs this user's profile update into the persisted session and current-user cache", () => {
    const { result } = setup();
    act(() => result.current.handleUserUpdate({ id: "u1", full_name: "Updated Person" }));
    expect(useAuthStore.getState()).toMatchObject({
      token: "jwt",
      user: { full_name: "Updated Person" },
    });
    expect(context.client.getQueryData(["user", "current"])).toMatchObject({
      full_name: "Updated Person",
    });
    expect(context.client.getQueryData(["user", "u1"])).toBeUndefined();
  });

  it("ignores unknown profiles without creating incomplete user records", () => {
    const { result } = setup(null);
    act(() => result.current.handleUserUpdate({ id: "unknown", full_name: "Unknown" }));
    expect(context.client.getQueryData(["user", "unknown"])).toBeUndefined();
    expect(chats()).toEqual([privateChat, group]);
  });

  it.each([true, false])(
    "syncs block state from a fresh profile and clears typing (%s)",
    async (blocked) => {
      const fresh = { ...partner, is_online: !blocked, is_blocked_by_other: blocked };
      vi.mocked(userService.getUserById).mockResolvedValue(fresh);
      useChatStore.getState().setUserTyping("c1", "u2", "Partner", true);
      const { result } = setup();
      act(() => {
        if (blocked) result.current.handleUserBlock({ blocker_id: "u2" });
        else result.current.handleUserUnblock({ blocker_id: "u2" });
      });
      await waitFor(() =>
        expect(chats()[0]).toMatchObject({ is_blocked_by_other: blocked, is_online: !blocked })
      );
      expect(chats()[1]).toEqual(group);
      expect(context.client.getQueryData(["user", "u2"])).toEqual(fresh);
      expect(useChatStore.getState().typingUsers["c1"]?.["u2"]).toBeUndefined();
    }
  );

  it.each([true, false])(
    "invalidates stale block data when the profile cannot be fetched (%s)",
    async (blocked) => {
      vi.mocked(userService.getUserById).mockRejectedValue(new Error("offline"));
      const { result } = setup();
      act(() => {
        if (blocked) result.current.handleUserBlock({ blocker_id: "u2" });
        else result.current.handleUserUnblock({ blocker_id: "u2" });
      });
      await waitFor(() =>
        expect(context.client.getQueryState(["user", "u2"])?.isInvalidated).toBe(true)
      );
      expect(context.client.getQueryState(["chats"])?.isInvalidated).toBe(true);
      expect(chats()).toEqual([privateChat, group]);
    }
  );

  it.each(["user.banned", "user.deleted"])(
    "marks affected private chats unavailable on %s",
    (type) => {
      const { result } = setup();
      act(() => result.current.handleUserBanDelete({ type, payload: { user_id: "u2" } }));
      const expected = {
        other_user_is_banned: type === "user.banned",
        other_user_is_deleted: type === "user.deleted",
        is_online: false,
      };
      expect(chats()[0]).toMatchObject(expected);
      expect(context.client.getQueryData(["chat", "c1"])).toMatchObject(expected);
      expect(chats()[1]).toEqual(group);
      expect(context.client.getQueryState(["user", "u2"])?.isInvalidated).toBe(true);
    }
  );

  it("removes a ban without removing an independent deletion flag", () => {
    const banned = { ...privateChat, other_user_is_banned: true, other_user_is_deleted: true };
    context.client.setQueryData(["chats"], {
      ...seed(),
      pages: [{ ...seed().pages[0], data: [banned, group] }],
    });
    context.client.setQueryData(["chat", "c1"], banned);
    const { result } = setup();
    act(() => result.current.handleUserUnbanned({ payload: { user_id: "u2" } }));
    expect(chats()[0]).toMatchObject({ other_user_is_banned: false, other_user_is_deleted: true });
    expect(context.client.getQueryData(["chat", "c1"])).toMatchObject({
      other_user_is_banned: false,
      other_user_is_deleted: true,
    });
  });

  it("dispatches self-ban and self-unban notifications with the reason", () => {
    const banned = vi.fn();
    const unbanned = vi.fn();
    window.addEventListener("user-banned", banned);
    window.addEventListener("user-unbanned", unbanned);
    try {
      const { result } = setup();
      act(() => {
        result.current.handleUserBanDelete({
          type: "user.banned",
          payload: { user_id: "u1", reason: "Policy" },
        });
        result.current.handleUserUnbanned({ payload: { user_id: "u1" } });
      });
      expect(banned).toHaveBeenCalledWith(
        expect.objectContaining({ detail: { reason: "Policy" } })
      );
      expect(unbanned).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("user-banned", banned);
      window.removeEventListener("user-unbanned", unbanned);
    }
  });
});
