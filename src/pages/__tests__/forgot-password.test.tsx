import { type CaptchaHandle } from "@/components/auth/captcha";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { toast } from "@/lib/toast";
import { authService, otpService } from "@/services";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import ForgotPassword from "../forgot-password";

const resetCaptcha = vi.hoisted(() => vi.fn());
vi.mock("@/services", () => ({
  authService: { resetPassword: vi.fn() },
  otpService: { sendOTP: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
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
let query: ReturnType<typeof createQueryWrapper>;
function show(path = "/forgot?email=person%40example.com&code=123456") {
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/login" element={<h1>Login destination</h1>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
    { wrapper: query.wrapper }
  );
}
function verify() {
  fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
}
function passwords(confirm = "StrongPassword1!") {
  fireEvent.change(screen.getByPlaceholderText("New Password"), {
    target: { value: "StrongPassword1!" },
  });
  fireEvent.change(screen.getByPlaceholderText("Confirm Password"), { target: { value: confirm } });
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
});
afterEach(() => query.client.clear());

describe("ForgotPassword form", () => {
  it("prefills deep links but waits for CAPTCHA before enabling actions", () => {
    show();
    expect(screen.getByPlaceholderText("Email")).toHaveValue("person@example.com");
    expect(screen.getByPlaceholderText("OTP Code")).toHaveValue("123456");
    expect(screen.getByRole("button", { name: /^Reset Password/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Request OTP" })).toBeDisabled();
    verify();
    expect(screen.getByRole("button", { name: "Reset Password" })).toBeEnabled();
  });
  it("normalizes email and restricts OTP to six digits", () => {
    show("/forgot");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: " person @example.com " },
    });
    fireEvent.change(screen.getByPlaceholderText("OTP Code"), { target: { value: "12ab345678" } });
    expect(screen.getByPlaceholderText("Email")).toHaveValue("person@example.com");
    expect(screen.getByPlaceholderText("OTP Code")).toHaveValue("123456");
  });
  it("rejects mismatched passwords without sending a reset", async () => {
    show();
    verify();
    passwords("DifferentPassword1!");
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });
  it("rejects an invalid email before requesting OTP", async () => {
    show("/forgot");
    verify();
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
    expect(await screen.findByText("Invalid email format.")).toBeInTheDocument();
    expect(otpService.sendOTP).not.toHaveBeenCalled();
  });
  it("requests a reset OTP and requires a fresh security token afterwards", async () => {
    vi.mocked(otpService.sendOTP).mockResolvedValue(undefined);
    show();
    verify();
    fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("OTP sent to your email"));
    expect(otpService.sendOTP).toHaveBeenCalledWith({
      email: "person@example.com",
      mode: "reset",
      captcha_token: "verified-token",
    });
    expect(resetCaptcha).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Reset Password/ })).toBeDisabled();
  });
  it.each(["OTP expired", undefined])(
    "shows an OTP request failure (%s) and resets CAPTCHA",
    async (error) => {
      vi.mocked(otpService.sendOTP).mockRejectedValue({ response: { data: { error } } });
      show();
      verify();
      fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error || "Failed to send OTP"));
      expect(resetCaptcha).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Request OTP" })).toBeDisabled();
    }
  );
  it("submits the validated reset payload and navigates to login", async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined);
    show();
    verify();
    passwords();
    fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    expect(await screen.findByRole("heading", { name: "Login destination" })).toBeInTheDocument();
    expect(authService.resetPassword).toHaveBeenCalledWith({
      email: "person@example.com",
      code: "123456",
      password: "StrongPassword1!",
      confirm_password: "StrongPassword1!",
      captcha_token: "verified-token",
    });
    expect(toast.success).toHaveBeenCalledWith("Password reset successfully");
  });
  it.each(["Invalid reset code", undefined])(
    "retains the form on reset failure (%s)",
    async (error) => {
      vi.mocked(authService.resetPassword).mockRejectedValue({ response: { data: { error } } });
      show();
      verify();
      passwords();
      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(error || "Password reset failed")
      );
      expect(screen.getByPlaceholderText("New Password")).toHaveValue("StrongPassword1!");
      expect(screen.getByRole("button", { name: /^Reset Password/ })).toBeDisabled();
      expect(resetCaptcha).toHaveBeenCalled();
    }
  );
  it.each(["Expire security", "Fail security"])("disables submission after %s", (name) => {
    show();
    verify();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: /^Reset Password/ })).toBeDisabled();
  });
  it("lets the user return to login", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Login", exact: true }));
    expect(await screen.findByRole("heading", { name: "Login destination" })).toBeInTheDocument();
  });
});
