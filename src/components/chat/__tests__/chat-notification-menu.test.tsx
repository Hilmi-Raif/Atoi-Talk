import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ChatNotificationItems, ChatNotificationStatus } from "../chat-notification-menu";
function ChatNotificationMenu({ chatID }: { chatID: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Chat options</DropdownMenuTrigger>
      <DropdownMenuContent>
        <ChatNotificationItems chatID={chatID} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const setMute = vi.fn();
function MobileMenu() {
  const [notifications, setNotifications] = useState(false);
  return (
    <DropdownMenu onOpenChange={() => setNotifications(false)}>
      <DropdownMenuTrigger>Chat options</DropdownMenuTrigger>
      <DropdownMenuContent>
        <ChatNotificationItems
          chatID="chat-a"
          onOpenMobile={() => setNotifications(true)}
          mobileOpen={notifications}
          onBack={() => setNotifications(false)}
        />
        {!notifications && <DropdownMenuItem>Delete Chat</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
beforeEach(() => {
  setMute.mockReset().mockResolvedValue(undefined);
  useNotificationPreferences.setState({ loaded: true, enabled: true, chats: [], setMute });
});
it("replaces the mobile menu in place and restores it with Back", async () => {
  render(<MobileMenu />);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Chat options" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Notifications" }));
  expect(screen.queryByRole("menuitem", { name: "Delete Chat" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  fireEvent.click(screen.getByRole("menuitem", { name: "Back" }));
  expect(screen.getByRole("menuitem", { name: "Delete Chat" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Notifications" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Mute for 1 hour" }));
  await waitFor(() => expect(setMute).toHaveBeenCalledWith("chat-a", 1));
});
it("offers timed mute and saves the selected conversation", async () => {
  render(<ChatNotificationMenu chatID="chat-a" />);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Chat options" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Notifications" }));
  const choice = await screen.findByRole("menuitem", { name: "Mute for 8 hours" });
  const submenu = choice.closest('[data-slot="dropdown-menu-sub-content"]');
  const root = document.querySelector('[data-slot="dropdown-menu-content"]');
  expect(submenu).not.toBeNull();
  expect(root).not.toContainElement(submenu as HTMLElement);
  fireEvent.click(choice);
  await waitFor(() => expect(setMute).toHaveBeenCalledWith("chat-a", 8));
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  fireEvent.pointerDown(screen.getByRole("button", { name: "Chat options" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(await screen.findByRole("menuitem", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Mute for 8 hours" })).not.toBeInTheDocument();
});
it("offers unmute without altering the global preference", async () => {
  useNotificationPreferences.setState({
    enabled: false,
    chats: [{ chat_id: "chat-a", muted_forever: true }],
  });
  render(<ChatNotificationMenu chatID="chat-a" />);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Chat options" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Notifications" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Unmute notifications" }));
  await waitFor(() => expect(setMute).toHaveBeenCalledWith("chat-a", "off"));
  expect(useNotificationPreferences.getState().enabled).toBe(false);
});

it("updates the status beside the name and hides unknown state", () => {
  const { rerender } = render(<ChatNotificationStatus chatID="chat-a" />);
  expect(screen.getByRole("img", { name: "Notifications on" })).toBeInTheDocument();
  act(() =>
    useNotificationPreferences.setState({ chats: [{ chat_id: "chat-a", muted_forever: true }] })
  );
  rerender(<ChatNotificationStatus chatID="chat-a" />);
  expect(screen.getByRole("img", { name: "Notifications muted" })).toBeInTheDocument();
  act(() => useNotificationPreferences.setState({ loaded: false }));
  rerender(<ChatNotificationStatus chatID="chat-a" />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
