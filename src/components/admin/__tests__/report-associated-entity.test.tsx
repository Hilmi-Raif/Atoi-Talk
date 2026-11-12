import { adminService } from "@/services/admin.service";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { ReportAssociatedEntity } from "../report-associated-entity";

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getUser: vi.fn(),
    getGroupDetail: vi.fn(),
    getGroupMembersInfinite: vi.fn(),
  },
}));
const user = {
  id: "u1",
  full_name: "Ada Lovelace",
  username: "ada",
  avatar: null,
  is_banned: false,
};
const group = {
  id: "group-123456",
  chat_id: "chat1",
  name: "Engineering",
  description: "Team chat",
  member_count: 3,
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
};
const members = [
  {
    id: "membership1",
    user_id: "u1",
    full_name: "Ada Lovelace",
    username: "ada",
    role: "owner",
    is_banned: false,
  },
  {
    id: "membership2",
    user_id: "u2",
    full_name: "Grace Hopper",
    username: "grace",
    role: "admin",
    is_banned: true,
  },
  {
    id: "membership3",
    user_id: "u3",
    full_name: "Alan Turing",
    username: "alan",
    role: "member",
    is_banned: false,
  },
];

describe("entities associated with admin reports", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const onUserAction = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(adminService.getUser).mockResolvedValue(user as never);
    vi.mocked(adminService.getGroupDetail).mockResolvedValue(group as never);
    vi.mocked(adminService.getGroupMembersInfinite).mockResolvedValue({
      data: members,
      meta: {},
    } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup(type: "user" | "group" = "user", extra = {}) {
    return render(
      <ReportAssociatedEntity
        id={type === "user" ? "u1" : group.id}
        type={type}
        label="Reported entity"
        isDeleted={false}
        onUserAction={onUserAction}
        {...extra}
      />,
      { wrapper: context.wrapper }
    );
  }

  it.each(["user", "group"] as const)("does not fetch a known deleted %s", (type) => {
    setup(type, { isDeleted: true });
    expect(screen.getByText(type === "user" ? "Deleted Account" : "Deleted Group")).toBeVisible();
    expect(adminService.getUser).not.toHaveBeenCalled();
    expect(adminService.getGroupDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(["user", "group"] as const)(
    "represents a missing %s as deleted instead of offering actions",
    async (type) => {
      const missing = { isAxiosError: true, response: { status: 404 } };
      if (type === "user") vi.mocked(adminService.getUser).mockRejectedValue(missing);
      else vi.mocked(adminService.getGroupDetail).mockRejectedValue(missing);
      setup(type);
      expect(
        await screen.findByText(type === "user" ? "Deleted Account" : "Deleted Group")
      ).toBeVisible();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    }
  );

  it("loads the user and forwards details, ban and reset actions with the correct ID", async () => {
    setup();
    expect(screen.queryByRole("button", { name: "Ban" })).not.toBeInTheDocument();
    expect(await screen.findByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByText("@ada")).toBeVisible();
    for (const [label, action] of [
      ["Details", "view"],
      ["Ban", "ban"],
      ["Reset", "reset"],
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label, exact: true }));
      expect(onUserAction).toHaveBeenLastCalledWith("u1", action);
    }
    expect(adminService.getGroupDetail).not.toHaveBeenCalled();
  });

  it.each([undefined, true, false])(
    "honors an explicit ban override while retaining the fetched status badge (%s)",
    async (override) => {
      vi.mocked(adminService.getUser).mockResolvedValue({ ...user, is_banned: true } as never);
      setup("user", { isBanned: override });
      await screen.findByText("Ada Lovelace");
      expect(screen.getByText("Banned")).toBeVisible();
      const action = override === false ? "Ban" : "Unban";
      fireEvent.click(screen.getByRole("button", { name: action, exact: true }));
      expect(onUserAction).toHaveBeenCalledWith("u1", action.toLowerCase());
    }
  );

  it("keeps a non-404 user error distinct from a deleted account", async () => {
    vi.mocked(adminService.getUser).mockRejectedValue(new Error("offline"));
    setup();
    expect(await screen.findByText("Unknown User")).toBeVisible();
    expect(screen.queryByText("Deleted Account")).not.toBeInTheDocument();
  });

  it("opens real group details and forwards member moderation actions", async () => {
    setup("group");
    expect(await screen.findByText("Engineering")).toBeVisible();
    expect(screen.getByText("3 members")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog", { name: "Group Detail" });
    expect(await within(dialog).findByText("Grace Hopper")).toBeVisible();
    expect(within(dialog).getByText("Public")).toBeVisible();
    expect(within(dialog).getByText("Team chat")).toBeVisible();
    const openMenu = async (index: number) => {
      fireEvent.pointerDown(within(dialog).getAllByRole("button", { name: "Open menu" })[index], {
        button: 0,
        ctrlKey: false,
      });
      return screen.findByRole("menu");
    };
    for (const [label, action] of [
      ["View Detail", "view"],
      ["Reset Info", "reset"],
      ["Ban User", "ban"],
    ]) {
      const menu = await openMenu(0);
      fireEvent.click(within(menu).getByRole("menuitem", { name: label }));
      expect(onUserAction).toHaveBeenLastCalledWith("u1", action);
    }
    const menu = await openMenu(1);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Unban User" }));
    expect(onUserAction).toHaveBeenLastCalledWith("u2", "unban");
  });

  it("uses safe group fallbacks when optional summary fields are absent", async () => {
    vi.mocked(adminService.getGroupDetail).mockResolvedValue({
      id: group.id,
      chat_id: "chat1",
    } as never);
    setup("group");
    expect(await screen.findByText("Unknown Group")).toBeVisible();
    expect(screen.getByText("0 members")).toBeVisible();
  });
});
