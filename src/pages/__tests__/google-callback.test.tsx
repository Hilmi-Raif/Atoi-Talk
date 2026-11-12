import { toast } from "@/lib/toast";
import { authService } from "@/services";
import { useAuthStore, useUIStore } from "@/store";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../test/query-wrapper";
import GoogleCallback from "../google-callback";

vi.mock("@/services", () => ({ authService: { googleLogin: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const user = {
  id: "u1",
  email: "person@example.com",
  full_name: "Test Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: false,
};

describe("Google OAuth callback", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useAuthStore.getState().logout();
    useUIStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
    useUIStore.getState().reset();
  });
  function setup(query: string, strict = false) {
    const app = (
      <MemoryRouter initialEntries={[`/callback${query}`]}>
        <Routes>
          <Route path="/callback" element={<GoogleCallback />} />
          <Route path="/login" element={<h1>Login destination</h1>} />
          <Route path="/" element={<h1>Chat destination</h1>} />
        </Routes>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{app}</StrictMode> : app, { wrapper: context.wrapper });
  }

  it.each(["?error=access_denied", "?error=cancelled&code=code&state=state"])(
    "returns cancelled authentication to login (%s)",
    async (query) => {
      setup(query);
      expect(await screen.findByRole("heading", { name: "Login destination" })).toBeVisible();
      expect(toast.error).toHaveBeenCalledWith("Google authentication failed or was cancelled");
      expect(authService.googleLogin).not.toHaveBeenCalled();
      expect(useUIStore.getState().globalLoading).toBe(false);
    }
  );

  it.each(["", "?code=code", "?state=state", "?code=&state=state"])(
    "rejects incomplete callback parameters (%s)",
    async (query) => {
      setup(query);
      expect(await screen.findByRole("heading", { name: "Login destination" })).toBeVisible();
      expect(toast.error).toHaveBeenCalledWith("Invalid Google authentication parameters");
      expect(authService.googleLogin).not.toHaveBeenCalled();
      expect(useUIStore.getState().globalLoading).toBe(false);
    }
  );

  it("exchanges the code once under StrictMode and persists the returned session", async () => {
    vi.mocked(authService.googleLogin).mockResolvedValue({
      token: "google-session",
      user,
    } as never);
    setup("?code=auth-code&state=csrf-state", true);
    expect(await screen.findByRole("heading", { name: "Chat destination" })).toBeVisible();
    expect(authService.googleLogin).toHaveBeenCalledExactlyOnceWith({
      code: "auth-code",
      state: "csrf-state",
    });
    expect(useAuthStore.getState()).toMatchObject({
      token: "google-session",
      user,
      isAuthenticated: true,
    });
  });

  it.each(["OAuth state expired", undefined])(
    "clears the loading screen and returns failed exchanges to login (%s)",
    async (error) => {
      vi.mocked(authService.googleLogin).mockRejectedValue({ response: { data: { error } } });
      setup("?code=auth-code&state=csrf-state");
      expect(await screen.findByRole("heading", { name: "Login destination" })).toBeVisible();
      await waitFor(() => expect(useUIStore.getState().globalLoading).toBe(false));
      expect(toast.error).toHaveBeenCalledWith(error || "Google login failed");
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    }
  );
});
