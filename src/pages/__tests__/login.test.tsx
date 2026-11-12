import type { CaptchaHandle } from "@/components/auth/captcha";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { toast } from "@/lib/toast";
import { authService } from "@/services";
import { useAuthStore, useUIStore } from "@/store";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import Login from "../login";

const resetCaptcha = vi.hoisted(() => vi.fn());
vi.mock("@/services", () => ({ authService: { login: vi.fn(), initGoogleAuth: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
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
function show() {
  return render(
    <ThemeProvider defaultTheme="light">
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<h1>Chat destination</h1>} />
          <Route path="/forgot" element={<h1>Recovery destination</h1>} />
          <Route path="/register" element={<h1>Register destination</h1>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
    { wrapper: query.wrapper }
  );
}
function fill(password = "StrongPassword1!") {
  fireEvent.change(screen.getByPlaceholderText("Email"), {
    target: { value: " person @example.com " },
  });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
}
function submit() {
  fireEvent.click(screen.getByRole("button", { name: /^Login(?: Loading)?$/ }));
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

describe("Login form", () => {
  it("requires CAPTCHA before allowing password login", () => {
    show();
    expect(screen.getByRole("button", { name: /^Login Loading$/ })).toBeDisabled();
    fill();
    expect(screen.getByPlaceholderText("Email")).toHaveValue("person@example.com");
    expect(screen.getByRole("button", { name: "Login", exact: true })).toBeEnabled();
  });
  it("validates missing password and malformed email without an API call", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Verify security" }));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "invalid" } });
    submit();
    expect(await screen.findByText("Invalid email format.")).toBeInTheDocument();
    expect(await screen.findByText("Password is required.")).toBeInTheDocument();
    expect(authService.login).not.toHaveBeenCalled();
  });
  it.each(["Short1!", "a".repeat(73), "lowercase1!", "UPPERCASE1!", "NoNumbers!", "NoSymbols123"])(
    "rejects invalid password shape without disclosing policy (%s)",
    async (password) => {
      show();
      fill(password);
      submit();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invalid email or password"));
      expect(authService.login).not.toHaveBeenCalled();
    }
  );
  it("stores the successful session and navigates to chat", async () => {
    const user = {
      id: "u1",
      full_name: "Person",
      email: "person@example.com",
      username: "person",
      avatar: null,
      bio: null,
      has_password: true,
    };
    vi.mocked(authService.login).mockResolvedValue({ token: "session-token", user });
    show();
    fill();
    submit();
    expect(await screen.findByRole("heading", { name: "Chat destination" })).toBeInTheDocument();
    expect(authService.login).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "StrongPassword1!",
      captcha_token: "verified-token",
    });
    expect(useAuthStore.getState()).toMatchObject({
      token: "session-token",
      user,
      isAuthenticated: true,
    });
  });
  it.each([
    [401, "private account detail", "Invalid email or password"],
    [403, "Account unavailable", "Account unavailable"],
    [500, undefined, "Invalid email or password"],
  ])("handles login failure %s and requires a new CAPTCHA", async (status, error, expected) => {
    vi.mocked(authService.login).mockRejectedValue({ response: { status, data: { error } } });
    show();
    fill();
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expected));
    expect(resetCaptcha).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Login Loading$/ })).toBeDisabled();
    expect(screen.getByPlaceholderText("Password")).toHaveValue("StrongPassword1!");
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
  it.each(["Expire security", "Fail security"])("disables login after %s", (name) => {
    show();
    fill();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: /^Login Loading$/ })).toBeDisabled();
  });
  it.each(["Google unavailable", undefined])(
    "keeps the form usable after Google initialization fails (%s)",
    async (error) => {
      vi.mocked(authService.initGoogleAuth).mockRejectedValue({ response: { data: { error } } });
      show();
      fill();
      fireEvent.click(screen.getByRole("button", { name: "Login with Google" }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(error || "Failed to initialize Google login")
      );
      expect(screen.getByRole("button", { name: "Login", exact: true })).toBeEnabled();
    }
  );
  it("navigates to the returned Google authorization URL", async () => {
    const location = { href: "" };
    vi.stubGlobal("location", location);
    vi.mocked(authService.initGoogleAuth).mockResolvedValue({
      auth_url: "https://accounts.example.test/authorize",
      state: "state",
      expires_in: 300,
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Login with Google" }));
    await waitFor(() => expect(location.href).toBe("https://accounts.example.test/authorize"));
    expect(authService.login).not.toHaveBeenCalled();
  });
  it.each([
    ["Forgot password?", "Recovery destination"],
    ["Register", "Register destination"],
  ])("opens %s", async (button, heading) => {
    show();
    fireEvent.click(screen.getByRole("button", { name: button, exact: true }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });
});
