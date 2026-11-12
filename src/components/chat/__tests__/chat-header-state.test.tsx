import { ThemeProvider } from "@/components/providers/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { ChatListItem, User } from "@/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import ChatHeader from "../chat-header";
import { ChatRoomHeader } from "../chat-room-header";

const partner: User = {
  id: "u2",
  email: "ada@example.com",
  full_name: "Ada",
  username: "ada",
  avatar: null,
  bio: null,
  has_password: true,
};
const chat = {
  id: "chat1",
  name: "Ada",
  type: "private",
  other_user_id: "u2",
  member_count: 2,
  avatar: null,
  last_message: null,
  unread_count: 0,
} as ChatListItem;
describe("chat header status and recovery", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    context = createQueryWrapper();
    useAuthStore.getState().setCredentials("token", { ...partner, id: "u1" });
    useUIStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
    useChatStore.getState().reset();
    useUIStore.getState().reset();
  });
  function setup(props: Partial<ComponentProps<typeof ChatHeader>> = {}) {
    return render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <SidebarProvider>
            <ChatHeader chat={chat} partnerId="u2" partnerProfile={partner} {...props} />
          </SidebarProvider>
        </MemoryRouter>
      </ThemeProvider>,
      { wrapper: context.wrapper }
    );
  }
  it.each([
    [{ is_online: true }, "Online"],
    [{ is_online: false }, "Offline"],
    [{ is_blocked_by_me: true, is_online: true }, "Last seen a long time ago"],
    [{ is_blocked_by_other: true, is_online: true }, "Last seen a long time ago"],
    [{ is_banned: true, is_online: true }, "Last seen a long time ago"],
    [{ last_seen_at: new Date().toISOString() }, "last seen just now"],
  ])("renders privacy-aware presence for %j", (flags, status) => {
    setup({ partnerProfile: { ...partner, ...flags } });
    expect(screen.getByText(status, { exact: false })).toBeVisible();
  });
  it("opens the loaded private profile with messaging hidden", () => {
    setup();
    fireEvent.click(screen.getByText("Ada"));
    expect(useUIStore.getState().profileModal).toMatchObject({
      isOpen: true,
      userId: "u2",
      config: { hideMessageButton: true },
    });
  });
  it.each(["busy", "missing", "deleted", "missingId"])(
    "does not open a profile when %s",
    (condition) => {
      if (condition === "busy") useUIStore.getState().setBusy(true);
      setup({
        chat: condition === "deleted" ? { ...chat, other_user_is_deleted: true } : chat,
        partnerProfile: condition === "missing" ? null : partner,
        partnerId: condition === "missingId" ? null : "u2",
      });
      fireEvent.click(screen.getByText(condition === "deleted" ? "Deleted Account" : "Ada"));
      expect(useUIStore.getState().profileModal.isOpen).toBe(false);
    }
  );
  it("retries the profile without opening the profile modal", () => {
    const retry = vi.fn();
    setup({ isProfileError: true, onRetryProfile: retry });
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledOnce();
    expect(useUIStore.getState().profileModal.isOpen).toBe(false);
  });
  it.each(["private", "group"] as const)(
    "shows remote typing but ignores local typing for %s chats",
    (type) => {
      useChatStore.setState({ typingUsers: { chat1: ["u1"] } });
      const view = setup({ chat: { ...chat, type } });
      expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
      view.unmount();
      useChatStore.setState({ typingUsers: { chat1: ["u1", "u2"] } });
      setup({ chat: { ...chat, type } });
      expect(
        screen.getByText(type === "private" ? "Typing..." : "Someone is typing...")
      ).toBeVisible();
    }
  );
  it("retries group metadata without opening its group dialog", () => {
    const retry = vi.fn();
    setup({
      chat: { ...chat, type: "group", name: "Engineering" },
      isChatError: true,
      onRetryChat: retry,
    });
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Engineering"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each(["private", "group"] as const)(
    "renders loading placeholders instead of stale %s identity",
    (type) => {
      setup({
        chat: { ...chat, type, member_count: undefined } as ChatListItem,
        isProfileLoading: type === "private",
      });
      expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    }
  );

  it.each([
    { chat: null, isChatLoading: true },
    { chat: null, isChatFetching: true },
    { chat: null, isVirtual: true, partnerProfile: null, isProfileLoading: true },
    { chat: null, isVirtual: true, partnerProfile: null, isProfileFetching: true },
    { chat: null, chatFailureCount: 1 },
    { chat: null, profileFailureCount: 3 },
    { chat: null, chatFailureCount: 4, isChatError: true },
    { chat: null, chatFailureCount: 1, chatError: { response: { status: 404 } } },
    { chat: null, profileFailureCount: 1, profileError: { response: { status: 404 } } },
    { chat: null, partnerId: null, profileFailureCount: 1 },
    { chat: null },
    { chat, isChatFetching: true },
  ])("keeps room header recovery stable for %j", (flags) => {
    const props = {
      chat,
      partnerId: "u2",
      partnerProfile: partner,
      isProfileError: false,
      isProfileLoading: false,
      isProfileFetching: false,
      refetchProfile: vi.fn(),
      isChatLoading: false,
      isChatFetching: false,
      isChatError: false,
      refetchChat: vi.fn(),
      isVirtual: false,
      chatFailureCount: 0,
      profileFailureCount: 0,
      chatError: null,
      profileError: null,
      ...flags,
    };
    const view = render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <SidebarProvider>
            <ChatRoomHeader {...props} />
          </SidebarProvider>
        </MemoryRouter>
      </ThemeProvider>,
      { wrapper: context.wrapper }
    );
    if (flags.chat) expect(screen.getByText("Ada")).toBeVisible();
    else {
      expect(screen.queryByText("Ada")).not.toBeInTheDocument();
      expect(view.container.querySelector("header")).toBeInTheDocument();
    }
  });
});
