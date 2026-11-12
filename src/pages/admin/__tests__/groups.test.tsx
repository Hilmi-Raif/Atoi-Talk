import { toast } from "@/lib/toast";
import { adminService } from "@/services/admin.service";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import AdminGroups from "../groups";

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getGroups: vi.fn(),
    getGroupDetail: vi.fn(),
    getGroupMembersInfinite: vi.fn(),
    dissolveGroup: vi.fn(),
    resetGroupInfo: vi.fn(),
    unbanUser: vi.fn(),
    getUser: vi.fn(),
    banUser: vi.fn(),
    resetUserInfo: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const group = {
  id: "g1",
  chat_id: "chat-1",
  name: "Engineering",
  description: "Team chat",
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("admin groups page", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(adminService.getGroups).mockResolvedValue({
      data: [group],
      meta: { has_next: false },
    } as never);
    vi.mocked(adminService.getGroupDetail).mockResolvedValue({
      ...group,
      member_count: 3,
    } as never);
    vi.mocked(adminService.getGroupMembersInfinite).mockResolvedValue({
      data: [],
      meta: {},
    } as never);
    vi.mocked(adminService.dissolveGroup).mockResolvedValue(undefined);
    vi.mocked(adminService.resetGroupInfo).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup() {
    render(<AdminGroups />, { wrapper: context.wrapper });
  }
  async function action(label: string) {
    await screen.findByText("Engineering");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Open menu" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  }

  it("renders group identity, description and public/private visibility", async () => {
    vi.mocked(adminService.getGroups).mockResolvedValue({
      data: [
        group,
        { ...group, chat_id: "chat-2", name: "Private team", description: null, is_public: false },
      ],
      meta: {},
    } as never);
    setup();
    expect(await screen.findByText("Engineering")).toBeVisible();
    expect(screen.getByText("Team chat")).toBeVisible();
    expect(screen.getByText("Public")).toBeVisible();
    expect(screen.getByText("Private")).toBeVisible();
  });

  it("shows an empty listing", async () => {
    vi.mocked(adminService.getGroups).mockResolvedValue({ data: [], meta: {} } as never);
    setup();
    expect(await screen.findByText("No groups found.")).toBeVisible();
  });

  it.each(["View Detail", "Reset Info", "Ban User", "Unban User"])(
    "moderates a member through group details: %s",
    async (label) => {
      vi.mocked(adminService.getGroupMembersInfinite).mockResolvedValue({
        data: [
          {
            id: "membership-1",
            user_id: "u2",
            full_name: "Grace Hopper",
            username: "grace",
            role: "member",
            is_banned: label === "Unban User",
          },
        ],
        meta: {},
      } as never);
      vi.mocked(adminService.getUser).mockResolvedValue({
        id: "u2",
        full_name: "Grace Hopper",
        username: "grace",
        email: "grace@example.com",
      } as never);
      vi.mocked(adminService.banUser).mockResolvedValue(undefined);
      vi.mocked(adminService.resetUserInfo).mockResolvedValue(undefined);
      vi.mocked(adminService.unbanUser).mockResolvedValue(undefined);
      setup();
      await action("View Detail");
      const detail = await screen.findByRole("dialog", { name: "Group Detail" });
      await within(detail).findByText("Grace Hopper");
      fireEvent.pointerDown(within(detail).getByRole("button", { name: "Open menu" }), {
        button: 0,
        ctrlKey: false,
      });
      fireEvent.click(await screen.findByRole("menuitem", { name: label, exact: true }));
      if (label === "Unban User") {
        await waitFor(() =>
          expect(toast.success).toHaveBeenCalledWith("User unbanned successfully")
        );
        expect(adminService.unbanUser).toHaveBeenCalledWith("u2", expect.anything());
      } else if (label === "View Detail") {
        expect(await screen.findByText("grace@example.com")).toBeVisible();
        expect(adminService.getUser).toHaveBeenCalledWith("u2");
      } else if (label === "Ban User") {
        const dialog = await screen.findByRole("dialog", { name: "Ban User" });
        fireEvent.change(within(dialog).getByLabelText("Reason for ban *"), {
          target: { value: "Repeated abuse" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Ban User" }));
        await waitFor(() =>
          expect(adminService.banUser).toHaveBeenCalledWith(
            expect.objectContaining({ target_user_id: "u2", reason: "Repeated abuse" }),
            expect.anything()
          )
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog", { name: "Ban User" })).not.toBeInTheDocument()
        );
      } else {
        const dialog = await screen.findByRole("dialog", { name: "Reset User Info" });
        fireEvent.click(within(dialog).getByLabelText("Reset Bio"));
        fireEvent.click(within(dialog).getByRole("button", { name: "Reset Info" }));
        await waitFor(() =>
          expect(adminService.resetUserInfo).toHaveBeenCalledWith(
            "u2",
            expect.objectContaining({ reset_bio: true })
          )
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog", { name: "Reset User Info" })).not.toBeInTheDocument()
        );
      }
    }
  );

  it("keeps group member details available when unbanning fails", async () => {
    vi.mocked(adminService.getGroupMembersInfinite).mockResolvedValue({
      data: [
        {
          id: "membership-1",
          user_id: "u2",
          full_name: "Grace Hopper",
          role: "member",
          is_banned: true,
        },
      ],
      meta: {},
    } as never);
    vi.mocked(adminService.unbanUser).mockRejectedValue(new Error("offline"));
    setup();
    await action("View Detail");
    const detail = await screen.findByRole("dialog", { name: "Group Detail" });
    await within(detail).findByText("Grace Hopper");
    fireEvent.pointerDown(within(detail).getByRole("button", { name: "Open menu" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Unban User" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to unban user"));
    expect(detail).toBeVisible();
    expect(within(detail).getByText("Grace Hopper")).toBeVisible();
  });

  it.each([new Error("Service unavailable"), {}])(
    "retries a failed listing without leaving the page: %j",
    async (error) => {
      vi.mocked(adminService.getGroups).mockRejectedValueOnce(error);
      setup();
      expect(await screen.findByText("Failed to load groups")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
      expect(await screen.findByText("Engineering")).toBeVisible();
    }
  );

  it("loads group details and membership before opening the detail dialog", async () => {
    setup();
    await action("View Detail");
    expect(await screen.findByRole("dialog", { name: "Group Detail" })).toBeVisible();
    expect(adminService.getGroupDetail).toHaveBeenCalledWith("chat-1");
    expect(adminService.getGroupMembersInfinite).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["admin-group-members-infinite", "chat-1", ""] })
    );
    expect(context.client.getQueryData(["admin-group-detail", "chat-1"])).toMatchObject({
      name: "Engineering",
    });
  });

  it("keeps the list usable when detail prefetch fails", async () => {
    vi.mocked(adminService.getGroupDetail).mockRejectedValue(new Error("Unavailable"));
    setup();
    await action("View Detail");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to load group details"));
    expect(screen.queryByRole("dialog", { name: "Group Detail" })).not.toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeVisible();
  });

  it("resets only selected fields and closes the confirmation on acknowledgement", async () => {
    setup();
    await action("Reset Info");
    const dialog = await screen.findByRole("dialog", { name: "Reset Group Info" });
    expect(within(dialog).getByRole("button", { name: "Reset Info" })).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText("Reset Name"));
    fireEvent.click(within(dialog).getByLabelText("Reset Avatar"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Info" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Group info reset successfully")
    );
    expect(adminService.resetGroupInfo).toHaveBeenCalledWith("chat-1", {
      reset_name: true,
      reset_description: false,
      reset_avatar: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("preserves reset selections after failure and supports cancelling", async () => {
    vi.mocked(adminService.resetGroupInfo).mockRejectedValue(new Error("Denied"));
    setup();
    await action("Reset Info");
    const dialog = await screen.findByRole("dialog", { name: "Reset Group Info" });
    fireEvent.click(within(dialog).getByLabelText("Reset Description"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset Info" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to reset group info"));
    expect(within(dialog).getByLabelText("Reset Description")).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it.each([true, false])(
    "dissolves only after confirmation and handles acknowledgement=%s",
    async (success) => {
      if (!success) vi.mocked(adminService.dissolveGroup).mockRejectedValue(new Error("Denied"));
      setup();
      await action("Dissolve Group");
      const dialog = await screen.findByRole("dialog", { name: "Dissolve Group" });
      expect(within(dialog).getByText(/dissolve "Engineering"/)).toBeVisible();
      expect(adminService.dissolveGroup).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Dissolve Group" }));
      await waitFor(() =>
        expect(success ? toast.success : toast.error).toHaveBeenCalledWith(
          success ? "Group dissolved successfully" : "Failed to dissolve group"
        )
      );
      expect(adminService.dissolveGroup).toHaveBeenCalledWith("chat-1", expect.anything());
      if (success)
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      else expect(dialog).toBeVisible();
    }
  );
});
