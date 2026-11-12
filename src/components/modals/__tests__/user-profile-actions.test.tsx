import { toast } from "@/lib/toast";
import { chatService, userService } from "@/services";
import { useAuthStore, useUIStore } from "@/store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { UserProfileDialog } from "../user-profile-dialog";

vi.mock("@/services", () => ({
  userService: { getUserById: vi.fn() },
  chatService: { createPrivateChat: vi.fn(), getChatById: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const user = {
  id: "u2",
  full_name: "Ada Lovelace",
  username: "ada",
  avatar: null,
  bio: null,
  is_online: false,
};
describe("user profile actions with real queries", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    useUIStore.getState().reset();
    vi.mocked(userService.getUserById).mockResolvedValue(user as never);
    vi.mocked(chatService.createPrivateChat).mockResolvedValue({ id: "chat-1" } as never);
    vi.mocked(chatService.getChatById).mockResolvedValue({
      id: "chat-1",
      type: "private",
      last_message: null,
    } as never);
    useUIStore.getState().openProfileModal("u2");
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useUIStore.getState().reset();
    useAuthStore.getState().logout();
  });
  function setup() {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<UserProfileDialog />} />
          <Route path="/chat/:id" element={<h1>Conversation destination</h1>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  it.each(["is_blocked_by_me", "is_blocked_by_other", "is_banned"])(
    "hides presence and disables messaging when %s",
    async (flag) => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        ...user,
        is_online: true,
        [flag]: true,
      } as never);
      setup();
      expect(await screen.findByText("Last seen a long time ago")).toBeVisible();
      expect(screen.getByRole("button", { name: "Message", exact: true })).toBeDisabled();
      expect(screen.queryByText("Online")).not.toBeInTheDocument();
    }
  );
  it("opens the selected person's conversation and closes the profile", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Message", exact: true }));
    expect(await screen.findByRole("heading", { name: "Conversation destination" })).toBeVisible();
    expect(chatService.createPrivateChat).toHaveBeenCalledWith({ target_user_id: "u2" });
    expect(useUIStore.getState().profileModal.isOpen).toBe(false);
  });
  it("retains the profile when starting a conversation fails", async () => {
    vi.mocked(chatService.createPrivateChat).mockRejectedValueOnce(new Error("offline"));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Message", exact: true }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Message", exact: true })).toBeEnabled()
    );
    expect(useUIStore.getState().profileModal.isOpen).toBe(true);
  });
  it("opens the report form for the displayed person", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Report", exact: true }));
    expect(await screen.findByRole("dialog", { name: /Report/ })).toBeVisible();
  });
  it("opens block confirmation without closing the underlying profile", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Block", exact: true }));
    expect(await screen.findByRole("dialog", { name: /Block User/ })).toBeVisible();
    expect(useUIStore.getState().profileModal.isOpen).toBe(true);
  });
  it("can hide direct messaging for a contextual profile", async () => {
    useUIStore.getState().openProfileModal("u2", { hideMessageButton: true });
    setup();
    await screen.findByText("Ada Lovelace");
    expect(screen.queryByRole("button", { name: "Message", exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("No bio available")).toBeVisible();
  });
  it("copies the actual username rather than its display prefix", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      setup();
      fireEvent.click(await screen.findByRole("button", { name: "Copy Username" }));
      expect(writeText).toHaveBeenCalledWith("ada");
      expect(toast.success).toHaveBeenCalledWith("Username copied to clipboard");
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
  it.each([null, "2026-01-01T12:00:00Z"])(
    "renders an offline profile with last seen %s",
    async (last_seen_at) => {
      vi.mocked(userService.getUserById).mockResolvedValue({
        ...user,
        last_seen_at,
        bio: "Computing pioneer",
      } as never);
      setup();
      expect(await screen.findByText("Computing pioneer")).toBeVisible();
      expect(screen.queryByText("Online")).not.toBeInTheDocument();
      if (!last_seen_at) expect(screen.getByText("Offline")).toBeVisible();
      else expect(screen.getByText(/Last seen/)).toBeVisible();
    }
  );
  it("does not offer moderation or direct messaging actions on the current user's profile", async () => {
    useAuthStore.getState().setCredentials("session", user as never);
    setup();
    await screen.findByText("Ada Lovelace");
    expect(
      screen.queryByRole("button", { name: /^(Message|Report|Block)$/ })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(useUIStore.getState().profileModal.isOpen).toBe(false));
  });
  it("closes a failed profile lookup instead of exposing stale actions", async () => {
    vi.mocked(userService.getUserById).mockRejectedValueOnce(new Error("not found"));
    setup();
    await waitFor(() => expect(useUIStore.getState().profileModal.isOpen).toBe(false));
    expect(toast.error).toHaveBeenCalledWith("Failed to load user profile");
    expect(screen.queryByRole("button", { name: "Message", exact: true })).not.toBeInTheDocument();
  });
});
