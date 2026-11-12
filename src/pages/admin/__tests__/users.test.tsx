import { toast } from "@/lib/toast";
import { adminService } from "@/services/admin.service";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import AdminUsers from "../users";

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getUsers: vi.fn(),
    getUser: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    resetUserInfo: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const ada = {
  id: "u1",
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  username: "ada",
  role: "admin",
  is_banned: false,
  created_at: "2026-01-01T00:00:00Z",
};
const grace = {
  ...ada,
  id: "u2",
  full_name: "Grace Hopper",
  email: "grace@example.com",
  username: "grace",
  role: "user",
  is_banned: true,
};
const first = { data: [ada, grace], meta: { has_next: true, next_cursor: "page2" } };
const last = { data: [{ ...ada, id: "u3", full_name: "Alan Turing" }], meta: { has_next: false } };

describe("admin user management page", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    // jsdom does not implement layout scrolling
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(adminService.getUsers).mockImplementation(
      async (params) => (params.cursor ? last : first) as never
    );
    vi.mocked(adminService.banUser).mockResolvedValue(undefined);
    vi.mocked(adminService.unbanUser).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });
  const setup = () => render(<AdminUsers />, { wrapper: context.wrapper });
  async function menu(index = 0) {
    fireEvent.pointerDown(screen.getAllByRole("button", { name: "Open menu" })[index], {
      button: 0,
      ctrlKey: false,
    });
    return screen.findByRole("menu");
  }

  it("renders user identities, roles and cursor navigation", async () => {
    setup();
    expect(await screen.findByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByText("grace@example.com")).toBeVisible();
    expect(screen.getByText("@ada")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Alan Turing")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Grace Hopper")).toBeVisible();
  });

  it("debounces search and returns a paged result to the first cursor", async () => {
    setup();
    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Alan Turing");
    fireEvent.change(screen.getByPlaceholderText("Search by name, email, or username..."), {
      target: { value: "Ada" },
    });
    await waitFor(() =>
      expect(adminService.getUsers).toHaveBeenCalledWith({
        query: "Ada",
        role: undefined,
        cursor: undefined,
        limit: 20,
      })
    );
    expect(await screen.findByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("filters by role using the real select control", async () => {
    setup();
    await screen.findByText("Ada Lovelace");
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Admin", exact: true }));
    await waitFor(() =>
      expect(adminService.getUsers).toHaveBeenCalledWith(
        expect.objectContaining({ role: "admin", cursor: undefined })
      )
    );
  });

  it("renders an empty result instead of fabricated rows", async () => {
    vi.mocked(adminService.getUsers).mockResolvedValue({ data: [], meta: {} } as never);
    setup();
    expect(await screen.findByText("No users found.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
  });

  it.each([new Error("Database unavailable"), { status: 503 }])(
    "recovers from a listing failure through Try Again (%s)",
    async (error) => {
      vi.mocked(adminService.getUsers).mockRejectedValueOnce(error);
      setup();
      expect(await screen.findByText("Failed to load users")).toBeVisible();
      expect(
        screen.getByText(error instanceof Error ? error.message : "An unexpected error occurred")
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
      expect(await screen.findByText("Ada Lovelace")).toBeVisible();
    }
  );

  it("opens a ban confirmation for the chosen user and submits its reason", async () => {
    setup();
    await screen.findByText("Ada Lovelace");
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Ban User" }));
    const dialog = await screen.findByRole("dialog", { name: "Ban User" });
    fireEvent.change(within(dialog).getByLabelText("Reason for ban *"), {
      target: { value: "Repeated abuse" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ban User" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("User banned successfully"));
    expect(adminService.banUser).toHaveBeenCalledWith(
      { target_user_id: "u1", reason: "Repeated abuse", duration_hours: undefined },
      expect.anything()
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers unban rather than ban for a banned user", async () => {
    setup();
    await screen.findByText("Grace Hopper");
    const actions = await menu(1);
    expect(
      within(actions).queryByRole("menuitem", { name: "Ban User", exact: true })
    ).not.toBeInTheDocument();
    fireEvent.click(within(actions).getByRole("menuitem", { name: "Unban User" }));
    const dialog = await screen.findByRole("dialog", { name: "Unban User" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unban User" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("User unbanned successfully"));
    expect(adminService.unbanUser).toHaveBeenCalledWith("u2", expect.anything());
  });

  it("opens and cancels reset info without changing the user", async () => {
    setup();
    await screen.findByText("Ada Lovelace");
    fireEvent.click(within(await menu()).getByRole("menuitem", { name: "Reset Info" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Reset User Info")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(adminService.resetUserInfo).not.toHaveBeenCalled();
  });
});
