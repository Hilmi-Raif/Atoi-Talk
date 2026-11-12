import { ThemeProvider } from "@/components/providers/theme-provider";
import { chatService, userService } from "@/services";
import { useChatStore, useUIStore } from "@/store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { MobileChatActions } from "../mobile-chat-actions";
import { NavHeader } from "../nav-header";

vi.mock("@/services", () => ({
  userService: { searchUsers: vi.fn(), getUserById: vi.fn() },
  chatService: { createPrivateChat: vi.fn(), getChatById: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const user = { id: "u2", full_name: "Ada", username: "ada", avatar: null };
const chat = { id: "chat-1", type: "private", name: "Ada", last_message: null };

describe.each(["mobile", "sidebar"] as const)("%s new conversation flow", (layout) => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useUIStore.getState().reset();
    useChatStore.getState().reset();
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [user],
      meta: { has_next: false },
    } as never);
    vi.mocked(userService.getUserById).mockResolvedValue(user as never);
    vi.mocked(chatService.createPrivateChat).mockResolvedValue(chat as never);
    vi.mocked(chatService.getChatById).mockResolvedValue(chat as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useUIStore.getState().reset();
    useChatStore.getState().reset();
  });
  function setup() {
    function Destination() {
      const location = useLocation();
      return <p>Conversation with {location.state?.initialUser?.full_name}</p>;
    }
    render(
      <ThemeProvider defaultTheme="light">
        <MemoryRouter>
          <Routes>
            <Route path="/" element={layout === "mobile" ? <MobileChatActions /> : <NavHeader />} />
            <Route path="/chat/:id" element={<Destination />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
      context
    );
  }
  function newChatButton() {
    if (layout === "mobile") return screen.getByRole("button", { name: "New chat" });
    return document.querySelector<HTMLButtonElement>("button:has(svg.lucide-mail-plus)")!;
  }
  async function findUser() {
    fireEvent.click(newChatButton());
    fireEvent.change(screen.getByPlaceholderText("Search users..."), {
      target: { value: "  Ada  " },
    });
    return screen.findByTitle("Send Message");
  }

  it("does not search until requested and normalizes the debounced search", async () => {
    setup();
    expect(userService.searchUsers).not.toHaveBeenCalled();
    await findUser();
    expect(userService.searchUsers).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Ada" }),
      expect.anything()
    );
  });
  it("creates the conversation with fresh profile data and seeds navigation and message caches", async () => {
    setup();
    fireEvent.click(await findUser());
    expect(await screen.findByText("Conversation with Ada")).toBeVisible();
    expect(chatService.createPrivateChat).toHaveBeenCalledWith({ target_user_id: "u2" });
    expect(context.client.getQueryData(["chat", "chat-1"])).toEqual(chat);
    expect(context.client.getQueryData(["messages", "chat-1"])).toMatchObject({
      pages: [{ data: [] }],
    });
    expect(useChatStore.getState().activeChatId).toBe("chat-1");
  });
  it.each(["profile", "create", "detail"])(
    "preserves a retryable search if the %s request fails",
    async (stage) => {
      if (stage === "profile")
        vi.mocked(userService.getUserById).mockRejectedValueOnce(new Error("offline"));
      if (stage === "create")
        vi.mocked(chatService.createPrivateChat).mockRejectedValueOnce(new Error("offline"));
      if (stage === "detail")
        vi.mocked(chatService.getChatById).mockRejectedValueOnce(new Error("offline"));
      setup();
      fireEvent.click(await findUser());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to start conversation"));
      expect(screen.getByPlaceholderText("Search users...")).toHaveValue("  Ada  ");
      expect(screen.getByTitle("Send Message")).toBeEnabled();
      fireEvent.click(screen.getByTitle("Send Message"));
      expect(await screen.findByText("Conversation with Ada")).toBeVisible();
    }
  );
  it("prevents duplicate submissions and dismissal during creation", async () => {
    vi.mocked(chatService.createPrivateChat).mockImplementation(() => new Promise(() => {}));
    setup();
    fireEvent.click(await findUser());
    await waitFor(() => expect(chatService.createPrivateChat).toHaveBeenCalledOnce());
    expect(screen.getByTitle("Send Message")).toBeDisabled();
    expect(screen.getByPlaceholderText("Search users...")).toBeDisabled();
    fireEvent.click(screen.getByTitle("Send Message"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(chatService.createPrivateChat).toHaveBeenCalledOnce();
  });
  it("filters blocked users from search results", async () => {
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [{ ...user, is_blocked_by_me: true }],
      meta: { has_next: false },
    } as never);
    setup();
    fireEvent.click(newChatButton());
    fireEvent.change(screen.getByPlaceholderText("Search users..."), { target: { value: "Ada" } });
    expect(await screen.findByText("No users found.")).toBeVisible();
    expect(screen.queryByTitle("Send Message")).not.toBeInTheDocument();
  });
  it("disables new chat and group actions while the UI is busy", () => {
    useUIStore.getState().setBusy(true);
    setup();
    expect(newChatButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Groups" })).toBeDisabled();
  });
});
