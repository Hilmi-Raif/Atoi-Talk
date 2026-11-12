import type { CaptchaHandle } from "@/components/auth/captcha";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { toast } from "@/lib/toast";
import { authService, otpService } from "@/services";
import { useAuthStore, useUIStore } from "@/store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import Register from "../register";

const resetCaptcha = vi.hoisted(() => vi.fn());
vi.mock("@/services", () => ({
  authService: { register: vi.fn(), initGoogleAuth: vi.fn() },
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
function show(path = "/register?email=person%40example.com&code=123456") {
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<h1>Chat destination</h1>} />
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
function fill() {
  fireEvent.change(screen.getByPlaceholderText("Username"), {
    target: { value: " New.Person_123 " },
  });
  fireEvent.change(screen.getByPlaceholderText("Full Name"), { target: { value: " New Person " } });
  fireEvent.change(screen.getByPlaceholderText("Password"), {
    target: { value: "StrongPassword1!" },
  });
  verify();
}
function submit() {
  fireEvent.click(screen.getByRole("button", { name: /^Register(?: Loading)?$/ }));
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
  useAuthStore.getState().logout();
  useUIStore.getState().reset();
});
afterEach(() => {
  query.client.clear();
  useAuthStore.getState().logout();
  useUIStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("Register form", () => {
  it("prefills verification deep links and waits for security verification", () => {
    show();
    expect(screen.getByPlaceholderText("Email")).toHaveValue("person@example.com");
    expect(screen.getByPlaceholderText("OTP Code")).toHaveValue("123456");
    expect(screen.getByRole("button", { name: /^Register Loading$/ })).toBeDisabled();
    fill();
    expect(screen.getByPlaceholderText("Username")).toHaveValue("newperson123");
    expect(screen.getByRole("button", { name: "Register", exact: true })).toBeEnabled();
  });
  it("does not submit missing registration details", async () => {
    show();
    verify();
    submit();
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Username")).toHaveAttribute("aria-invalid", "true")
    );
    expect(screen.getByPlaceholderText("Full Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("aria-invalid", "true");
    expect(authService.register).not.toHaveBeenCalled();
  });
  it("does not request an OTP for an invalid email", async () => {
    show("/register");
    verify();
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
    expect(await screen.findByText("Invalid email format.")).toBeInTheDocument();
    expect(otpService.sendOTP).not.toHaveBeenCalled();
  });
  it("requests a registration OTP and consumes its security token", async () => {
    vi.mocked(otpService.sendOTP).mockResolvedValue(undefined);
    show();
    verify();
    fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("OTP sent to your email"));
    expect(otpService.sendOTP).toHaveBeenCalledWith({
      email: "person@example.com",
      mode: "register",
      captcha_token: "verified-token",
    });
    expect(resetCaptcha).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Register Loading$/ })).toBeDisabled();
  });
  it.each(["OTP unavailable", undefined])("recovers from OTP failure (%s)", async (error) => {
    vi.mocked(otpService.sendOTP).mockRejectedValue({ response: { data: { error } } });
    show();
    verify();
    fireEvent.click(screen.getByRole("button", { name: "Request OTP" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error || "Failed to send OTP"));
    expect(resetCaptcha).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Request OTP" })).toBeDisabled();
  });
  it("submits normalized details then establishes the session after the login transition", async () => {
    const user = {
      id: "u1",
      full_name: "New Person",
      email: "person@example.com",
      username: "newperson123",
      avatar: null,
      bio: null,
      has_password: true,
    };
    vi.mocked(authService.register).mockResolvedValue({ token: "new-session", user });
    show();
    fill();
    submit();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Account created successfully"));
    expect(authService.register).toHaveBeenCalledWith({
      email: "person@example.com",
      code: "123456",
      username: "newperson123",
      full_name: "New Person",
      password: "StrongPassword1!",
      captcha_token: "verified-token",
    });
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(
      await screen.findByRole("heading", { name: "Chat destination" }, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({
      token: "new-session",
      user,
      isAuthenticated: true,
    });
    expect(useUIStore.getState().globalLoading).toBe(false);
  });
  it.each(["Username unavailable", undefined])(
    "preserves entered details after registration failure (%s)",
    async (error) => {
      vi.mocked(authService.register).mockRejectedValue({ response: { data: { error } } });
      show();
      fill();
      submit();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error || "Registration failed"));
      expect(screen.getByPlaceholderText("Username")).toHaveValue("newperson123");
      expect(screen.getByRole("button", { name: /^Register Loading$/ })).toBeDisabled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(resetCaptcha).toHaveBeenCalled();
    }
  );
  it.each(["Expire security", "Fail security"])("blocks registration after %s", (name) => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: /^Register Loading$/ })).toBeDisabled();
  });
  it.each(["Google unavailable", undefined])("recovers from Google failure (%s)", async (error) => {
    vi.mocked(authService.initGoogleAuth).mockRejectedValue({ response: { data: { error } } });
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Register with Google" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(error || "Failed to initialize Google login")
    );
    expect(screen.getByRole("button", { name: "Register", exact: true })).toBeEnabled();
  });
  it("uses the returned Google authorization URL", async () => {
    const location = { href: "" };
    vi.stubGlobal("location", location);
    vi.mocked(authService.initGoogleAuth).mockResolvedValue({
      auth_url: "https://accounts.example.test/register",
      state: "state",
      expires_in: 300,
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Register with Google" }));
    await waitFor(() => expect(location.href).toBe("https://accounts.example.test/register"));
  });
  it("returns to login", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Login", exact: true }));
    expect(await screen.findByRole("heading", { name: "Login destination" })).toBeInTheDocument();
  });
});
