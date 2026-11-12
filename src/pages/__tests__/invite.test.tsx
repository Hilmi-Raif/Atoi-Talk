import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { useAuthStore } from "@/store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import InvitePage from "../invite";

vi.mock("@/services", () => ({
  chatService: { getGroupPreview: vi.fn(), joinGroupByInvite: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const group = {
  id: "g1",
  type: "group",
  name: "Engineering",
  description: "Team discussion",
  member_count: 12,
  avatar: null,
};

describe("invite landing and joining", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.getState().logout();
    context = createQueryWrapper();
    vi.mocked(chatService.getGroupPreview).mockResolvedValue(group as never);
    vi.mocked(chatService.joinGroupByInvite).mockResolvedValue(group as never);
  });
  afterEach(() => {
    context.client.clear();
    useAuthStore.getState().logout();
  });
  function setup(path = "/invite/abc123") {
    function Destination() {
      const location = useLocation();
      return (
        <p>
          Destination: {location.pathname}
          {location.search}
        </p>
      );
    }
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/invite/:code?" element={<InvitePage />} />
          <Route path="*" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
      context
    );
  }
  function authenticate() {
    useAuthStore.setState({ isAuthenticated: true });
  }

  it("shows loading before the resolved preview and renders public group details", async () => {
    setup();
    expect(screen.getByText("Loading invite info...")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Engineering" })).toBeVisible();
    expect(screen.getByText("Team discussion")).toBeVisible();
    expect(screen.getByText("12 members")).toBeVisible();
    expect(chatService.getGroupPreview).toHaveBeenCalledWith("abc123");
  });
  it("rejects a missing invite code without an API request", async () => {
    setup("/invite");
    expect(await screen.findByText("Invalid invite link")).toBeVisible();
    expect(chatService.getGroupPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Go Home" }));
    expect(await screen.findByText("Destination: /")).toBeVisible();
  });
  it.each(["Invite revoked", undefined])(
    "shows preview failure with a useful fallback (%s)",
    async (error) => {
      vi.mocked(chatService.getGroupPreview).mockRejectedValue({ response: { data: { error } } });
      setup();
      expect(
        await screen.findByText(error || "This invite link is invalid or has expired.")
      ).toBeVisible();
      expect(screen.queryByRole("button", { name: "Join Group" })).not.toBeInTheDocument();
    }
  );
  it("redirects guests to sign in with the invite return path without joining", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Join Group" }));
    expect(await screen.findByText("Destination: /login?redirect=/invite/abc123")).toBeVisible();
    expect(chatService.joinGroupByInvite).not.toHaveBeenCalled();
  });
  it("joins as an authenticated user, invalidates chat lists and navigates to the chat", async () => {
    authenticate();
    context.client.setQueryData(["chats"], { cached: true });
    context.client.setQueryData(["unrelated"], { cached: true });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Join Group" }));
    expect(await screen.findByText("Destination: /chat/g1")).toBeVisible();
    expect(chatService.joinGroupByInvite).toHaveBeenCalledWith("abc123");
    expect(toast.success).toHaveBeenCalledWith("Successfully joined Engineering");
    expect(context.client.getQueryState(["chats"])?.isInvalidated).toBe(true);
    expect(context.client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
  });
  it.each(["Group is full", undefined])("keeps a failed join retryable (%s)", async (error) => {
    authenticate();
    vi.mocked(chatService.joinGroupByInvite).mockRejectedValueOnce({
      response: { data: { error } },
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Join Group" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error || "Failed to join group"));
    expect(screen.getByRole("button", { name: "Join Group" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Join Group" }));
    expect(await screen.findByText("Destination: /chat/g1")).toBeVisible();
  });
  it("opens the existing chat when the server reports that the user is already a member", async () => {
    authenticate();
    vi.mocked(chatService.joinGroupByInvite).mockRejectedValue({
      response: { data: { error: "You are already a member" } },
    });
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Join Group" }));
    expect(await screen.findByText("Destination: /chat/g1")).toBeVisible();
  });
  it("disables joining while the request is unresolved", async () => {
    authenticate();
    vi.mocked(chatService.joinGroupByInvite).mockImplementation(() => new Promise(() => {}));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Join Group" }));
    expect(screen.getByRole("button", { name: "Joining..." })).toBeDisabled();
  });
  it("lets authenticated users cancel without joining", async () => {
    authenticate();
    setup();
    fireEvent.click(await screen.findByRole("link", { name: "Cancel" }));
    expect(await screen.findByText("Destination: /")).toBeVisible();
    expect(chatService.joinGroupByInvite).not.toHaveBeenCalled();
  });
});
