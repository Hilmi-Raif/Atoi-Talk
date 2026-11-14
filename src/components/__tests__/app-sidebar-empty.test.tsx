import { AppSidebar } from "@/components/layouts/app-sidebar";
import MobileChatListPage from "@/pages/mobile-chat-list";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/providers/theme-provider", () => ({ useTheme: () => ({ theme: "dark" }) }));
vi.mock("@/components/layouts/mobile-chat-actions", () => ({ MobileChatActions: () => null }));
vi.mock("@/components/layouts/mobile-user-menu", () => ({ MobileUserMenu: () => null }));

const state = vi.hoisted(() => ({ query: "missing", loading: false, error: false }));
vi.mock("@/store", () => ({
  useChatStore: () => ({ searchQuery: state.query, setSearchQuery: vi.fn() }),
  useAuthStore: () => ({ user: { id: "user-a" } }),
  useUIStore: (select: (value: unknown) => unknown) => select({ setGlobalLoading: vi.fn() }),
}));
vi.mock("@/hooks/queries", () => ({
  useChats: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: state.loading,
    isError: state.error,
  }),
}));
vi.mock("@/hooks/chat-list/use-chat-list-scroll", () => ({ useChatListScroll: () => ({}) }));
vi.mock("@/components/ui/sidebar", () => {
  const Box = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return {
    Sidebar: Box,
    SidebarContent: Box,
    SidebarHeader: Box,
    SidebarFooter: Box,
    SidebarProvider: Box,
  };
});
vi.mock("@/components/chat-search-input.tsx", () => ({ ChatSearchInput: () => null }));
vi.mock("@/components/layouts/nav-header.tsx", () => ({ NavHeader: () => null }));
vi.mock("@/components/layouts/nav-footer.tsx", () => ({ NavFooter: () => null }));
vi.mock("@/components/layouts/nav-chat.tsx", () => ({ NavChat: () => <div>Chat list</div> }));
beforeEach(() => {
  state.query = "missing";
  state.loading = false;
  state.error = false;
});
it("shows a centered empty search message", () => {
  render(<AppSidebar />);
  expect(screen.getByRole("status")).toHaveTextContent("No chats found.");
  expect(screen.queryByText("Chat list")).not.toBeInTheDocument();
});
it("shows the empty search message on the separate mobile page", () => {
  render(<MobileChatListPage />);
  expect(screen.getByRole("status")).toHaveTextContent("No chats found.");
});
it.each(["loading", "error"])("does not show empty search during %s", (mode) => {
  state.loading = mode === "loading";
  state.error = mode === "error";
  render(<AppSidebar />);
  expect(screen.queryByText("No chats found.")).not.toBeInTheDocument();
});
it("shows the original empty message without a search on mobile", () => {
  state.query = "";
  render(<MobileChatListPage />);
  expect(screen.getByRole("status")).toHaveTextContent("No chats found.");
  expect(screen.queryByRole("button", { name: "Show me around" })).not.toBeInTheDocument();
});
