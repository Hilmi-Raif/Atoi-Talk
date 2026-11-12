import { userService } from "@/services";
import { userService as directUserService } from "@/services/user.service";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../../test/query-wrapper";
import { BlockedUsersDialog } from "../blocked-users-dialog";

vi.mock("@/services", () => ({ userService: { getBlockedUsers: vi.fn() } }));
vi.mock("@/services/user.service", () => ({
  userService: { unblockUser: vi.fn(), getUserById: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const user = { id: "u2", full_name: "Ada", username: "ada", avatar: null, is_blocked_by_me: true };
describe("blocked users account dialog", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(userService.getBlockedUsers).mockResolvedValue({ data: [user], meta: {} } as never);
    vi.mocked(directUserService.unblockUser).mockResolvedValue(undefined);
    vi.mocked(directUserService.getUserById).mockResolvedValue({
      ...user,
      is_blocked_by_me: false,
    } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup(open = true) {
    render(<BlockedUsersDialog open={open} onOpenChange={vi.fn()} />, { wrapper: context.wrapper });
  }
  async function unblock() {
    const name = await screen.findByText("Ada");
    fireEvent.click(within(name.parentElement!.parentElement!.parentElement!).getByRole("button"));
    return screen.findByRole("dialog", { name: "Unblock User" });
  }
  it("does not load the list while closed", () => {
    setup(false);
    expect(userService.getBlockedUsers).not.toHaveBeenCalled();
  });
  it("disables search for an empty initial list", async () => {
    vi.mocked(userService.getBlockedUsers).mockResolvedValue({ data: [], meta: {} } as never);
    setup();
    expect(await screen.findByText("You haven't blocked any users yet.")).toBeVisible();
    expect(screen.getByPlaceholderText("Search blocked users...")).toBeDisabled();
  });
  it("debounces a trimmed three-character search and displays empty search results", async () => {
    setup();
    await screen.findByText("Ada");
    vi.mocked(userService.getBlockedUsers).mockResolvedValue({ data: [], meta: {} } as never);
    fireEvent.change(screen.getByPlaceholderText("Search blocked users..."), {
      target: { value: "  Missing  " },
    });
    expect(await screen.findByText("No users found.")).toBeVisible();
    expect(userService.getBlockedUsers).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Missing", limit: 20 }),
      expect.anything()
    );
    expect(screen.getByPlaceholderText("Search blocked users...")).toBeEnabled();
  });
  it("requires confirmation before unblocking and closes that confirmation on success", async () => {
    setup();
    const dialog = await unblock();
    expect(directUserService.unblockUser).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unblock", exact: true }));
    await waitFor(() => expect(directUserService.unblockUser).toHaveBeenCalledWith("u2"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Unblock User" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("dialog", { name: "Blocked Users" })).toBeVisible();
  });
  it("keeps a failed unblock retryable without dismissing the account dialog", async () => {
    vi.mocked(directUserService.unblockUser).mockRejectedValueOnce(new Error("Offline"));
    setup();
    const dialog = await unblock();
    fireEvent.click(within(dialog).getByRole("button", { name: "Unblock", exact: true }));
    await waitFor(() => expect(directUserService.unblockUser).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Unblock", exact: true })).toBeEnabled()
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Unblock", exact: true }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Unblock User" })).not.toBeInTheDocument()
    );
  });
  it("retries a listing failure", async () => {
    vi.mocked(userService.getBlockedUsers).mockRejectedValueOnce(new Error("Offline"));
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Ada")).toBeVisible();
  });
});
