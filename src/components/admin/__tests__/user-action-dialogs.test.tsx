import { toast } from "@/lib/toast";
import { adminService } from "@/services/admin.service";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { UserBanDialog, UserResetDialog, UserUnbanDialog } from "../user-action-dialogs";

vi.mock("@/services/admin.service", () => ({
  adminService: {
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    resetUserInfo: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("admin user action dialogs", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const close = vi.fn();
  const success = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    for (const key of [
      ["admin-users"],
      ["admin-group-members-infinite", "g1"],
      ["admin-user-detail", "u2"],
      ["unrelated"],
    ]) {
      context.client.setQueryData(key, { cached: true });
    }
    vi.mocked(adminService.banUser).mockResolvedValue(undefined as never);
    vi.mocked(adminService.unbanUser).mockResolvedValue(undefined as never);
    vi.mocked(adminService.resetUserInfo).mockResolvedValue(undefined as never);
  });
  afterEach(() => context.client.clear());

  it("locks reset dismissal while the request is pending and unlocks after failure", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(adminService.resetUserInfo).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    render(<UserResetDialog open onOpenChange={close} userId="u2" />, context);
    fireEvent.click(screen.getByLabelText("Reset Avatar"));
    fireEvent.click(screen.getByRole("button", { name: "Reset Info" }));
    await waitFor(() => expect(screen.getByLabelText("Reset Avatar")).toBeDisabled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    reject(new Error("offline"));
    await waitFor(() => expect(screen.getByLabelText("Reset Avatar")).toBeEnabled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledWith(false);
  });

  it.each([null, "u2"])(
    "does not ban without both a selected user and reason (user=%s)",
    (userId) => {
      render(<UserBanDialog open onOpenChange={close} userId={userId} />, context);
      if (!userId)
        fireEvent.change(screen.getByLabelText("Reason for ban *"), { target: { value: "Abuse" } });
      fireEvent.click(screen.getByRole("button", { name: "Ban User", exact: true }));
      expect(adminService.banUser).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    }
  );

  it.each(["", "24"])(
    "bans with an optional duration (%s) and invalidates affected lists",
    async (duration) => {
      render(<UserBanDialog open onOpenChange={close} userId="u2" onSuccess={success} />, context);
      fireEvent.change(screen.getByLabelText("Reason for ban *"), {
        target: { value: "Repeated harassment" },
      });
      fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: duration } });
      fireEvent.click(screen.getByRole("button", { name: "Ban User", exact: true }));
      await waitFor(() => expect(close).toHaveBeenCalledWith(false));
      expect(adminService.banUser).toHaveBeenCalledWith(
        {
          target_user_id: "u2",
          reason: "Repeated harassment",
          duration_hours: duration ? 24 : undefined,
        },
        expect.anything()
      );
      expect(success).toHaveBeenCalledOnce();
      expect(context.client.getQueryState(["admin-users"])?.isInvalidated).toBe(true);
      expect(
        context.client.getQueryState(["admin-group-members-infinite", "g1"])?.isInvalidated
      ).toBe(true);
      expect(context.client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
    }
  );

  it("keeps a failed ban editable and does not dismiss it", async () => {
    vi.mocked(adminService.banUser).mockRejectedValue(new Error("offline"));
    render(<UserBanDialog open onOpenChange={close} userId="u2" />, context);
    fireEvent.change(screen.getByLabelText("Reason for ban *"), { target: { value: "Abuse" } });
    fireEvent.click(screen.getByRole("button", { name: "Ban User", exact: true }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to ban user"));
    expect(screen.getByLabelText("Reason for ban *")).toHaveValue("Abuse");
    expect(close).not.toHaveBeenCalled();
  });

  it("clears stale ban fields when reopened", () => {
    const view = render(<UserBanDialog open onOpenChange={close} userId="u2" />, context);
    fireEvent.change(screen.getByLabelText("Reason for ban *"), {
      target: { value: "Old reason" },
    });
    fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: "48" } });
    view.rerender(<UserBanDialog open={false} onOpenChange={close} userId="u2" />);
    view.rerender(<UserBanDialog open onOpenChange={close} userId="u2" />);
    expect(screen.getByLabelText("Reason for ban *")).toHaveValue("");
    expect(screen.getByLabelText(/Duration/)).toHaveValue(null);
  });

  it.each(["Reset Avatar", "Reset Name", "Reset Bio"])(
    "resets only the selected field: %s",
    async (label) => {
      render(
        <UserResetDialog open onOpenChange={close} userId="u2" onSuccess={success} />,
        context
      );
      expect(screen.getByRole("button", { name: "Reset Info" })).toBeDisabled();
      fireEvent.click(screen.getByLabelText(label));
      fireEvent.click(screen.getByRole("button", { name: "Reset Info" }));
      await waitFor(() => expect(close).toHaveBeenCalledWith(false));
      expect(adminService.resetUserInfo).toHaveBeenCalledWith("u2", {
        reset_avatar: label === "Reset Avatar",
        reset_name: label === "Reset Name",
        reset_bio: label === "Reset Bio",
      });
      expect(success).toHaveBeenCalledOnce();
      expect(context.client.getQueryState(["admin-user-detail", "u2"])?.isInvalidated).toBe(true);
    }
  );

  it("cannot reset a missing user even when a field is selected", () => {
    render(<UserResetDialog open onOpenChange={close} userId={null} />, context);
    fireEvent.click(screen.getByLabelText("Reset Avatar"));
    fireEvent.click(screen.getByRole("button", { name: "Reset Info" }));
    expect(adminService.resetUserInfo).not.toHaveBeenCalled();
  });

  it("retains reset selections after an API failure", async () => {
    vi.mocked(adminService.resetUserInfo).mockRejectedValue(new Error("offline"));
    render(<UserResetDialog open onOpenChange={close} userId="u2" />, context);
    fireEvent.click(screen.getByLabelText("Reset Bio"));
    fireEvent.click(screen.getByRole("button", { name: "Reset Info" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to reset user info"));
    expect(screen.getByLabelText("Reset Bio")).toBeChecked();
    expect(close).not.toHaveBeenCalled();
  });

  it("cancels reset without a request", () => {
    render(<UserResetDialog open onOpenChange={close} userId="u2" />, context);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledWith(false);
    expect(adminService.resetUserInfo).not.toHaveBeenCalled();
  });

  it("unbans the selected user and refreshes affected caches", async () => {
    render(<UserUnbanDialog open onOpenChange={close} userId="u2" onSuccess={success} />, context);
    fireEvent.click(screen.getByRole("button", { name: "Unban User", exact: true }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(adminService.unbanUser).toHaveBeenCalledWith("u2", expect.anything());
    expect(success).toHaveBeenCalledOnce();
    expect(context.client.getQueryState(["admin-users"])?.isInvalidated).toBe(true);
  });

  it("does not unban a missing user", () => {
    render(<UserUnbanDialog open onOpenChange={close} userId={null} />, context);
    fireEvent.click(screen.getByRole("button", { name: "Unban User", exact: true }));
    expect(adminService.unbanUser).not.toHaveBeenCalled();
  });

  it("keeps unban confirmation open on failure", async () => {
    vi.mocked(adminService.unbanUser).mockRejectedValue(new Error("offline"));
    render(<UserUnbanDialog open onOpenChange={close} userId="u2" />, context);
    fireEvent.click(screen.getByRole("button", { name: "Unban User", exact: true }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to unban user"));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
