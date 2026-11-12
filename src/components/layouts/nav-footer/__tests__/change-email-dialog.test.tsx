import type { CaptchaHandle } from "@/components/auth/captcha";
import { toast } from "@/lib/toast";
import { authService, otpService } from "@/services";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../../test/query-wrapper";
import { ChangeEmailDialog } from "../change-email-dialog";

const resetCaptcha = vi.hoisted(() => vi.fn());
vi.mock("@/services", () => ({
  authService: { changeEmail: vi.fn(), logout: vi.fn() },
  otpService: { sendOTP: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/auth/captcha", () => ({
  Captcha: forwardRef<
    CaptchaHandle,
    { onVerify: (token: string) => void; onExpire: () => void; onError: () => void }
  >((props, ref) => {
    useImperativeHandle(ref, () => ({ reset: resetCaptcha, execute: vi.fn() }));
    return (
      <div>
        <button type="button" onClick={() => props.onVerify("verified-token")}>
          Verify security
        </button>
        <button type="button" onClick={props.onExpire}>
          Expire security
        </button>
        <button type="button" onClick={props.onError}>
          Fail security
        </button>
      </div>
    );
  }),
}));
const user = {
  id: "u1",
  email: "old@example.com",
  full_name: "Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
};
let query: ReturnType<typeof createQueryWrapper>;
const onOpenChange = vi.fn();
function show() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={<ChangeEmailDialog open onOpenChange={onOpenChange} user={user} />}
        />
        <Route path="/login" element={<h1>Login destination</h1>} />
      </Routes>
    </MemoryRouter>,
    { wrapper: query.wrapper }
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText("New Email"), { target: { value: " new @example.com " } });
  fireEvent.change(screen.getByLabelText("OTP Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
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

describe("ChangeEmailDialog", () => {
  it("validates an incomplete OTP then allows dismissal while idle", async () => {
    show();
    fireEvent.change(screen.getByLabelText("OTP Code"), { target: { value: "12" } });
    await waitFor(() => expect(screen.getByText(/6/)).toBeVisible());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(authService.changeEmail).not.toHaveBeenCalled();
  });
  it.each(["otp", "email"])(
    "blocks dismissal and duplicate editing while %s is pending",
    async (stage) => {
      let reject!: (error: Error) => void;
      const pending = new Promise<never>((_, fail) => {
        reject = fail;
      });
      if (stage === "otp") vi.mocked(otpService.sendOTP).mockReturnValue(pending);
      else vi.mocked(authService.changeEmail).mockReturnValue(pending);
      show();
      fill();
      fireEvent.click(
        screen.getByRole("button", {
          name: stage === "otp" ? "Request OTP" : "Change Email",
          exact: true,
        })
      );
      await waitFor(() => expect(screen.getByLabelText("New Email")).toBeDisabled());
      expect(screen.getByLabelText("OTP Code")).toBeDisabled();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(onOpenChange).not.toHaveBeenCalled();
      reject(new Error("offline"));
      await waitFor(() => expect(screen.getByLabelText("New Email")).toBeEnabled());
      expect(screen.getByLabelText("New Email")).toHaveValue("new@example.com");
    }
  );
  it("requires a different valid email, six digits and CAPTCHA", async () => {
    show();
    expect(screen.getByRole("button", { name: /^Change Email/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New Email"), { target: { value: user.email } });
    expect(
      await screen.findByText("New email must be different from current email.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request OTP" })).toBeDisabled();
    fill();
    expect(screen.getByLabelText("New Email")).toHaveValue("new@example.com");
    expect(screen.getByRole("button", { name: "Change Email", exact: true })).toBeEnabled();
  });
  it("validates email and strips non-numeric OTP characters", async () => {
    show();
    fireEvent.change(screen.getByLabelText("New Email"), { target: { value: "invalid" } });
    expect(await screen.findByText("Invalid email format.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("OTP Code"), { target: { value: "1a2b345678" } });
    expect(screen.getByLabelText("OTP Code")).toHaveValue("123456");
    expect(authService.changeEmail).not.toHaveBeenCalled();
  });
  it("sends a change-email OTP and consumes the CAPTCHA token", async () => {
    vi.mocked(otpService.sendOTP).mockResolvedValue(undefined);
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("OTP sent to your email", {
        id: "otp-sent-success",
      })
    );
    expect(otpService.sendOTP).toHaveBeenCalledWith({
      email: "new@example.com",
      mode: "change_email",
      captcha_token: "verified-token",
    });
    expect(resetCaptcha).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Request OTP" })).toBeDisabled();
  });
  it.each(["Email unavailable", undefined])(
    "allows recovery from OTP failure (%s)",
    async (error) => {
      vi.mocked(otpService.sendOTP).mockRejectedValue({ response: { data: { error } } });
      show();
      fill();
      fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(error || "Failed to send OTP", {
          id: "otp-sent-error",
        })
      );
      expect(resetCaptcha).toHaveBeenCalled();
      expect(screen.getByLabelText("New Email")).toHaveValue("new@example.com");
    }
  );
  it.each(["Code expired", undefined])(
    "preserves entered data after change failure (%s)",
    async (error) => {
      vi.mocked(authService.changeEmail).mockRejectedValue({ response: { data: { error } } });
      show();
      fill();
      fireEvent.click(screen.getByRole("button", { name: "Change Email", exact: true }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(error || "Email update failed", {
          id: "email-update-error",
        })
      );
      expect(screen.getByRole("button", { name: "Change Email", exact: true })).toBeEnabled();
      expect(screen.getByLabelText("OTP Code")).toHaveValue("123456");
      expect(onOpenChange).not.toHaveBeenCalled();
    }
  );
  it("changes the email then logs out and navigates to login", async () => {
    vi.mocked(authService.changeEmail).mockResolvedValue(undefined as never);
    vi.mocked(authService.logout).mockResolvedValue(undefined);
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Change Email", exact: true }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(authService.changeEmail).toHaveBeenCalledWith({
      email: "new@example.com",
      code: "123456",
    });
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(
      await screen.findByRole("heading", { name: "Login destination" }, { timeout: 3500 })
    ).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useUIStore.getState().globalLoading).toBe(false);
  });
  it.each(["Expire security", "Fail security"])("requires re-verification after %s", (name) => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: /^Change Email/ })).toBeDisabled();
  });
});
