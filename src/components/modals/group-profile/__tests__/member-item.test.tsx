import { ChatListItem, GroupMember, User } from "@/types";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemberItem } from "../member-item";

const member = {
  id: "membership-2",
  user_id: "u2",
  full_name: "Ada Lovelace",
  username: "ada",
  avatar: null,
  role: "member",
} as GroupMember;

describe("group member permissions and actions", () => {
  afterEach(cleanup);
  function setup(
    myRole = "member",
    overrides: Partial<GroupMember> = {},
    currentUser: User | null = { id: "u1" } as User
  ) {
    const target = { ...member, ...overrides };
    const actions = {
      onViewProfile: vi.fn(),
      onPromote: vi.fn(),
      onDemote: vi.fn(),
      onTransfer: vi.fn(),
      onKick: vi.fn(),
    };
    render(
      <MemberItem
        member={target}
        currentUser={currentUser}
        chat={{ my_role: myRole } as ChatListItem}
        {...actions}
      />
    );
    return { actions, target };
  }
  it.each([undefined, "Deleted Account"])(
    "hides profile and moderation controls for a deleted identity (%s)",
    (full_name) => {
      setup("owner", { full_name });
      expect(screen.getByText("Deleted Account")).toBeVisible();
      expect(screen.getByText("?")).toBeVisible();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    }
  );
  it("labels the current member You and never offers self-moderation", () => {
    setup("owner", { user_id: "u1", role: "owner" });
    expect(screen.getByText("You")).toBeVisible();
    expect(screen.getByText(/@ada.*owner/)).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it.each(["member", "admin", "owner"] as const)(
    "opens another %s's profile without privileged controls for ordinary members",
    (role) => {
      const { actions, target } = setup("member", { role });
      fireEvent.click(screen.getByTitle("View Profile"));
      expect(actions.onViewProfile).toHaveBeenCalledWith(target);
      expect(screen.queryByTitle("Member Settings")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Remove Member")).not.toBeInTheDocument();
    }
  );
  it.each(["member", "admin", "owner"] as const)(
    "only allows an admin to directly remove ordinary members (target=%s)",
    (role) => {
      const { actions, target } = setup("admin", { role });
      if (role === "member") {
        fireEvent.click(screen.getByTitle("Remove Member"));
        expect(actions.onKick).toHaveBeenCalledWith(target);
      } else expect(screen.queryByTitle("Remove Member")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Member Settings")).not.toBeInTheDocument();
    }
  );
  it.each([
    ["member", "Promote to Admin", "onPromote"],
    ["admin", "Demote to Member", "onDemote"],
    ["member", "Transfer Ownership", "onTransfer"],
    ["admin", "Remove Member", "onKick"],
  ] as const)(
    "routes the owner's %s / %s action to the selected membership",
    async (role, label, action) => {
      const { actions, target } = setup("owner", { role });
      fireEvent.pointerDown(screen.getByTitle("Member Settings"), { button: 0, ctrlKey: false });
      const menu = await screen.findByRole("menu");
      expect(
        within(menu).queryByRole("menuitem", {
          name: role === "member" ? "Demote to Member" : "Promote to Admin",
        })
      ).not.toBeInTheDocument();
      fireEvent.click(within(menu).getByRole("menuitem", { name: label }));
      expect(actions[action]).toHaveBeenCalledWith(target);
    }
  );
  it("still exposes the public profile when no current user is supplied", () => {
    const { actions, target } = setup("member", {}, null);
    fireEvent.click(screen.getByTitle("View Profile"));
    expect(actions.onViewProfile).toHaveBeenCalledWith(target);
  });
});
