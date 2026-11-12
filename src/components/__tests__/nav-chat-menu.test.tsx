import { NavChat } from "@/components/layouts/nav-chat";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
vi.mock("@/hooks/mutations/use-group", () => ({
  useDeleteGroup: () => ({}),
  useLeaveGroup: () => ({}),
}));
vi.mock("@/hooks/mutations/use-hide-chat", () => ({ useHideChat: () => ({}) }));
vi.mock("@/components/modals/block-user-dialog", () => ({ BlockUserDialog: () => null }));
vi.mock("@/components/modals/report-dialog", () => ({ ReportDialog: () => null }));
vi.mock("@/components/ui/confirmation-dialog.tsx", () => ({ ConfirmationDialog: () => null }));
vi.mock("@/components/ui/sidebar", () => {
  const Box = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    useSidebar: () => ({ isMobile: true }),
    SidebarGroup: Box,
    SidebarMenu: Box,
    SidebarMenuItem: Box,
    SidebarMenuButton: Box,
    SidebarMenuAction: ({ children, ...props }: React.ComponentProps<"button">) => (
      <button {...props} aria-label="Chat options">
        {children}
      </button>
    ),
  };
});
function Menu() {
  const [active, setActive] = useState<string | null>(null);
  return (
    <MemoryRouter>
      <NavChat
        chats={[{ id: "chat-a", name: "Alice", type: "private", unread_count: 0 }]}
        activeMenu={active}
        setActiveMenu={setActive}
      />
    </MemoryRouter>
  );
}
it("reopens the mobile dropdown at the root after dismissing Notifications", async () => {
  useNotificationPreferences.setState({ loaded: true, enabled: true, chats: [] });
  render(<Menu />);
  fireEvent.click(screen.getByRole("button", { name: "Chat options" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Notifications" }));
  expect(screen.getByRole("menuitem", { name: "Back" })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chat options" }));
  expect(await screen.findByRole("menuitem", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Delete Chat" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Back" })).not.toBeInTheDocument();
});
