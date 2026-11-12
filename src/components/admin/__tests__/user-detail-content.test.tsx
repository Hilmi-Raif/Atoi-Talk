import { AdminUserDetailResponse } from "@/services/admin.service";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserDetailContent } from "../user-detail-content";

describe("admin user identity and account metadata", () => {
  afterEach(cleanup);
  const user = {
    id: "u1",
    full_name: "Ada Lovelace",
    username: "ada",
    email: "ada@example.com",
    role: "user",
    avatar: null,
  } as AdminUserDetailResponse;
  it("renders absent profile statistics and timestamps without inventing account data", () => {
    render(<UserDetailContent user={user} />);
    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
    expect(screen.getByText("@ada")).toBeVisible();
    expect(screen.getByText("No bio available.")).toBeVisible();
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText("Ban reason")).not.toBeInTheDocument();
  });
  it("renders populated statistics, biography and timestamps for an administrator", () => {
    render(
      <UserDetailContent
        user={{
          ...user,
          role: "admin",
          bio: "Engineer",
          total_messages: 1234,
          total_groups: 3,
          created_at: "2026-01-01T00:00:00Z",
          last_seen_at: new Date().toISOString(),
        }}
      />
    );
    expect(screen.getByText("admin")).toBeVisible();
    expect(screen.getByText("Engineer")).toBeVisible();
    expect(screen.getByText((1234).toLocaleString())).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
  it.each([false, true])("shows ban duration and optional reason (temporary=%s)", (temporary) => {
    render(
      <UserDetailContent
        user={{
          ...user,
          is_banned: true,
          ban_reason: temporary ? "Spam" : undefined,
          banned_until: temporary ? "2026-12-01T00:00:00Z" : null,
        }}
      />
    );
    expect(screen.getByText("Banned")).toBeVisible();
    expect(screen.getByText("Ban reason")).toBeVisible();
    if (temporary) {
      expect(screen.getByText("Spam")).toBeVisible();
      expect(screen.queryByText("Permanent")).not.toBeInTheDocument();
    } else {
      expect(screen.getByText("Permanent")).toBeVisible();
      expect(screen.getAllByText("—")).toHaveLength(3);
    }
  });
});
