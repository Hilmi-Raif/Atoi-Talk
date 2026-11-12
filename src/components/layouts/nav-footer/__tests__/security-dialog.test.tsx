import { toast } from "@/lib/toast";
import { authService } from "@/services";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../../test/query-wrapper";
import { SecurityDialog } from "../security-dialog";

vi.mock("@/services", () => ({ authService: { changePassword: vi.fn(), logout: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const user = {
  id: "u1",
  email: "person@example.com",
  full_name: "Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
};
let query: ReturnType<typeof createQueryWrapper>;
const onOpenChange = vi.fn();
function show(hasPassword = true) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <SecurityDialog
              open
              onOpenChange={onOpenChange}
              user={{ ...user, has_password: hasPassword }}
            />
          }
        />
        <Route path="/login" element={<h1>Login destination</h1>} />
      </Routes>
    </MemoryRouter>,
    { wrapper: query.wrapper }
  );
}
function fill(hasPassword = true) {
  if (hasPassword)
    fireEvent.change(screen.getByLabelText("Old Password"), { target: { value: "OldPassword1!" } });
  fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "NewPassword1!" } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), {
    target: { value: "NewPassword1!" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
  useAuthStore.getState().setCredentials("session", user);
  useUIStore.getState().reset();
});
afterEach(() => {
  query.client.clear();
  useAuthStore.getState().logout();
  useChatStore.getState().reset();
  useUIStore.getState().reset();
});

describe("SecurityDialog", () => {
  it("requires the existing password for password accounts", () => {
    show();
    expect(screen.getByText("Enter old password & new password.")).toBeInTheDocument();
    fill(false);
    expect(screen.getByRole("button", { name: "Save Password" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Old Password"), { target: { value: "OldPassword1!" } });
    expect(screen.getByRole("button", { name: "Save Password" })).toBeEnabled();
  });
  it("validates new passwords and matching confirmation before calling the API", async () => {
    show();
    fill();
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "weak" } });
    expect(screen.getByRole("button", { name: "Save Password" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "NewPassword1!" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "DifferentPassword1!" },
    });
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(authService.changePassword).not.toHaveBeenCalled();
  });
  it("catches confirmation made stale by changing the new password", async () => {
    show();
    fill();
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "OtherPassword1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(authService.changePassword).not.toHaveBeenCalled();
  });
  it("validates an invalid old password at submission", async () => {
    show();
    fill();
    fireEvent.change(screen.getByLabelText("Old Password"), { target: { value: "weak" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Old Password")).toHaveValue("weak");
  });
  it.each([true, false])(
    "saves a password and forces reauthentication (existing password=%s)",
    async (hasPassword) => {
      vi.mocked(authService.changePassword).mockResolvedValue(undefined as never);
      vi.mocked(authService.logout).mockResolvedValue(undefined);
      show(hasPassword);
      fill(hasPassword);
      if (!hasPassword) expect(screen.queryByLabelText("Old Password")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(authService.changePassword).toHaveBeenCalledWith({
        old_password: hasPassword ? "OldPassword1!" : undefined,
        new_password: "NewPassword1!",
        confirm_password: "NewPassword1!",
      });
      expect(useUIStore.getState().globalLoading).toBe(true);
      expect(
        await screen.findByRole("heading", { name: "Login destination" }, { timeout: 3500 })
      ).toBeInTheDocument();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useUIStore.getState().globalLoading).toBe(false);
    }
  );
  it.each(["Wrong old password", undefined])(
    "preserves password fields on failure (%s)",
    async (error) => {
      vi.mocked(authService.changePassword).mockRejectedValue({
        response: { status: 400, data: { error } },
      });
      show();
      fill();
      fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(error || "Password update failed", {
          id: "password-update-error",
        })
      );
      expect(screen.getByLabelText("New Password")).toHaveValue("NewPassword1!");
      expect(screen.getByRole("button", { name: "Save Password" })).toBeEnabled();
      expect(onOpenChange).not.toHaveBeenCalled();
    }
  );
  it("prevents closing and changing fields while the save is pending", async () => {
    let fail!: (error: unknown) => void;
    vi.mocked(authService.changePassword).mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        })
    );
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Save Password" }));
    await waitFor(() => expect(screen.getByLabelText("New Password")).toBeDisabled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fail({ response: { status: 400, data: { error: "Rejected" } } });
    await waitFor(() => expect(screen.getByLabelText("New Password")).toBeEnabled());
  });
});
