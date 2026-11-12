import { Tabs } from "@/components/ui/tabs";
import { ChatListItem } from "@/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../../test/query-wrapper";
import { OverviewTab } from "../overview-tab";

describe("group overview", () => {
  afterEach(cleanup);
  function setup(overrides: Partial<ChatListItem> = {}) {
    const context = createQueryWrapper();
    const actions = {
      setIsAvatarLoaded: vi.fn(),
      onAvatarClick: vi.fn(),
      onEditGroup: vi.fn(),
      onLeaveGroup: vi.fn(),
      onDeleteGroup: vi.fn(),
      onReportGroup: vi.fn(),
    };
    render(
      <Tabs defaultValue="overview">
        <OverviewTab
          activeTab="overview"
          chat={
            {
              id: "g1",
              type: "group",
              name: "Engineering",
              my_role: "member",
              member_count: 3,
              ...overrides,
            } as ChatListItem
          }
          isAvatarLoaded={false}
          {...actions}
        />
      </Tabs>,
      { wrapper: context.wrapper }
    );
    return actions;
  }
  it.each(["owner", "admin", "member"] as const)(
    "exposes the appropriate %s actions",
    (my_role) => {
      const actions = setup({ my_role, description: "Team discussion" });
      expect(screen.getByRole("heading", { name: "Engineering" })).toBeVisible();
      expect(screen.getByText("Team discussion")).toBeVisible();
      expect(screen.getByText("3 members")).toBeVisible();
      if (my_role === "member") {
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Report" }));
        expect(actions.onReportGroup).toHaveBeenCalledOnce();
      } else {
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        expect(actions.onEditGroup).toHaveBeenCalledOnce();
        expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
      }
      fireEvent.click(
        screen.getByRole("button", { name: my_role === "owner" ? "Delete" : "Leave" })
      );
      expect(
        my_role === "owner" ? actions.onDeleteGroup : actions.onLeaveGroup
      ).toHaveBeenCalledOnce();
    }
  );
  it.each([undefined, 0, 1])(
    "handles missing, empty and singular membership counts (%s)",
    (member_count) => {
      setup({ member_count, description: null });
      expect(screen.getByText(member_count === 1 ? "1 member" : "0 members")).toBeVisible();
      expect(screen.getByText("No description")).toBeVisible();
    }
  );
  it.each([
    [false, "member", false],
    [true, "member", true],
    [false, "admin", true],
    [false, "owner", true],
  ] as const)(
    "only shows a private invite to privileged members (public=%s role=%s)",
    (is_public, my_role, visible) => {
      setup({ is_public, my_role, invite_code: "invite-123" });
      expect(screen.getByTitle(is_public ? "Public Group" : "Private Group")).toBeVisible();
      if (visible) expect(screen.getByTitle("Copy Link")).toBeVisible();
      else expect(screen.queryByTitle("Copy Link")).not.toBeInTheDocument();
    }
  );
  it("does not fabricate an invite when none exists", () => {
    setup({ is_public: true, invite_code: null });
    expect(screen.queryByTitle("Copy Link")).not.toBeInTheDocument();
  });
});
