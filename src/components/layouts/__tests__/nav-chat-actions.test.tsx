import { SidebarProvider } from "@/components/ui/sidebar";
import { chatService } from "@/services";
import directChatService from "@/services/chat.service";
import { userService } from "@/services/user.service";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { ChatListItem } from "@/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { NavChat } from "../nav-chat";

vi.mock("@/services", () => ({ chatService: { leaveGroup: vi.fn(), deleteGroup: vi.fn() } }));
vi.mock("@/services/chat.service", () => ({ default: { hideChat: vi.fn() } }));
vi.mock("@/services/user.service", () => ({
  userService: { blockUser: vi.fn(), unblockUser: vi.fn(), getUserById: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn(), debugLog: vi.fn() }));
const base = {
  id: "chat1",
  name: "Engineering",
  type: "group",
  my_role: "owner",
  member_count: 3,
  unread_count: 0,
  last_message: null,
  avatar: null,
} as ChatListItem;
describe("conversation menu mutations", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    useAuthStore.setState({ user: { id: "u1" } as never });
    useUIStore.getState().reset();
    vi.mocked(chatService.leaveGroup).mockResolvedValue(undefined);
    vi.mocked(chatService.deleteGroup).mockResolvedValue(undefined);
    vi.mocked(directChatService.hideChat).mockResolvedValue(undefined);
    vi.mocked(userService.blockUser).mockResolvedValue(undefined);
    vi.mocked(userService.unblockUser).mockResolvedValue(undefined);
    vi.mocked(userService.getUserById).mockResolvedValue({ id: "u2", is_online: true } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
    useChatStore.getState().reset();
    useUIStore.getState().reset();
  });
  function setup(chat = base, active = true) {
    context.client.setQueryData(["chats"], {
      pages: [{ data: [chat], meta: {} }],
      pageParams: [undefined],
    });
    useChatStore.getState().setActiveChatId(active ? chat.id : "other");
    function Menu() {
      const [activeMenu, setActiveMenu] = useState<string | null>(null);
      return <NavChat chats={[chat]} activeMenu={activeMenu} setActiveMenu={setActiveMenu} />;
    }
    return render(
      <MemoryRouter initialEntries={[active ? "/chat/chat1" : "/chat/other"]}>
        <SidebarProvider>
          <Routes>
            <Route path="/chat/:id" element={<Menu />} />
            <Route path="/" element={<h1>Conversation list</h1>} />
          </Routes>
        </SidebarProvider>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  async function open() {
    const trigger = document.querySelector('[data-sidebar="menu-action"]')!;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);
    return screen.findByRole("menu");
  }
  it.each(["read", "delivered", "sent"])(
    "renders the %s receipt for an outgoing private preview",
    (state) => {
      const created_at = "2026-01-01T10:00:00Z";
      const { container } = setup({
        ...base,
        type: "private",
        is_online: state === "delivered",
        other_last_read_at: state === "read" ? created_at : null,
        last_message: { id: "m1", type: "text", sender_id: "u1", content: "Preview", created_at },
      } as ChatListItem);
      const receipt = container.querySelector(
        state === "sent" ? "svg.lucide-check" : "svg.lucide-check-check"
      );
      expect(receipt).toBeInTheDocument();
      if (state === "read") expect(receipt).toHaveClass("text-blue-500");
      else expect(receipt).not.toHaveClass("text-blue-500");
    }
  );
  it.each(["private", "group"])(
    "shows only remote typing activity for a %s conversation",
    (type) => {
      useChatStore.setState({ typingUsers: { chat1: ["u1", "u2"] } });
      setup({ ...base, type } as ChatListItem);
      expect(
        screen.getByText(type === "group" ? "Someone is typing..." : "Typing...")
      ).toBeVisible();
    }
  );
  it("prevents selecting another conversation while the global UI is busy", () => {
    useUIStore.getState().setBusy(true);
    setup(base, false);
    fireEvent.click(screen.getByRole("button", { name: /Engineering/ }));
    expect(useChatStore.getState().activeChatId).toBe("other");
    expect(screen.queryByRole("heading", { name: "Conversation list" })).not.toBeInTheDocument();
  });
  it.each([
    ["owner", true],
    ["owner", false],
    ["member", true],
    ["member", false],
    ["private", true],
    ["private", false],
  ] as const)(
    "confirms %s removal without navigating away from another chat (active=%s)",
    async (kind, active) => {
      const chat =
        kind === "private"
          ? ({ ...base, type: "private", other_user_id: "u2" } as ChatListItem)
          : { ...base, my_role: kind };
      setup(chat, active);
      fireEvent.click(
        within(await open()).getByRole("menuitem", {
          name:
            kind === "owner" ? "Delete Group" : kind === "member" ? "Leave Group" : "Delete Chat",
          exact: true,
        })
      );
      const dialog = await screen.findByRole("dialog");
      expect(chatService.deleteGroup).not.toHaveBeenCalled();
      expect(chatService.leaveGroup).not.toHaveBeenCalled();
      expect(directChatService.hideChat).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: kind === "owner" ? "Delete Group" : kind === "member" ? "Leave" : "Delete",
          exact: true,
        })
      );
      const service =
        kind === "owner"
          ? chatService.deleteGroup
          : kind === "member"
            ? chatService.leaveGroup
            : directChatService.hideChat;
      await waitFor(() => expect(service).toHaveBeenCalledWith("chat1"));
      if (active) {
        expect(await screen.findByRole("heading", { name: "Conversation list" })).toBeVisible();
        expect(useChatStore.getState().activeChatId).toBeNull();
      } else {
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(
          screen.queryByRole("heading", { name: "Conversation list" })
        ).not.toBeInTheDocument();
        expect(useChatStore.getState().activeChatId).toBe("other");
      }
    }
  );
  it("cancels destructive operations without calling the backend", async () => {
    setup();
    fireEvent.click(within(await open()).getByRole("menuitem", { name: "Delete Group" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chatService.deleteGroup).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "confirms a private user action and reconciles blocked=%s",
    async (blocked) => {
      setup({ ...base, type: "private", other_user_id: "u2", is_blocked_by_me: blocked });
      fireEvent.click(
        within(await open()).getByRole("menuitem", {
          name: blocked ? "Unblock User" : "Block User",
          exact: true,
        })
      );
      const dialog = await screen.findByRole("dialog", {
        name: blocked ? "Unblock User" : "Block User",
      });
      const service = blocked ? userService.unblockUser : userService.blockUser;
      expect(service).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog).getByRole("button", { name: blocked ? "Unblock" : "Block", exact: true })
      );
      await waitFor(() => expect(service).toHaveBeenCalledWith("u2"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(
        context.client.getQueryData<{ pages: { data: ChatListItem[] }[] }>(["chats"])?.pages[0]
          .data[0].is_blocked_by_me
      ).toBe(!blocked);
      expect(useChatStore.getState().activeChatId).toBe("chat1");
    }
  );
  it.each(["owner", "member"] as const)(
    "preserves the %s confirmation on a rejected request and allows retry",
    async (role) => {
      const service = role === "owner" ? chatService.deleteGroup : chatService.leaveGroup;
      vi.mocked(service).mockRejectedValueOnce(new Error("offline"));
      setup({ ...base, my_role: role }, false);
      fireEvent.click(
        within(await open()).getByRole("menuitem", {
          name: role === "owner" ? "Delete Group" : "Leave Group",
        })
      );
      const dialog = await screen.findByRole("dialog");
      const button = within(dialog).getByRole("button", {
        name: role === "owner" ? "Delete Group" : "Leave",
        exact: true,
      });
      fireEvent.click(button);
      await waitFor(() => expect(service).toHaveBeenCalledOnce());
      await waitFor(() => expect(button).toBeEnabled());
      expect(dialog).toBeVisible();
      fireEvent.click(button);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(service).toHaveBeenCalledTimes(2);
    }
  );
  it.each(["group", "user"] as const)(
    "opens the correct %s report without navigating",
    async (kind) => {
      setup(
        kind === "group"
          ? { ...base, my_role: "member" }
          : { ...base, type: "private", other_user_id: "u2" }
      );
      fireEvent.click(
        within(await open()).getByRole("menuitem", {
          name: kind === "group" ? "Report Group" : "Report User",
        })
      );
      expect(await screen.findByRole("dialog")).toHaveTextContent("Engineering");
      expect(screen.queryByRole("heading", { name: "Conversation list" })).not.toBeInTheDocument();
    }
  );
});
