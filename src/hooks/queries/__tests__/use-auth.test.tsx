import { authService } from "@/services";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import type { User } from "@/types";
import { act, renderHook } from "@testing-library/react";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import {
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useGoogleLogin,
  useInitGoogleAuth,
  useLogin,
  useLogout,
  useRegister,
  useResetPassword,
} from "../use-auth";

vi.mock("@/services", () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    googleLogin: vi.fn(),
    initGoogleAuth: vi.fn(),
    resetPassword: vi.fn(),
    changeEmail: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
    logout: vi.fn(),
  },
}));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

const user: User = {
  id: "u1",
  email: "person@example.com",
  full_name: "Test Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
};

describe("authentication mutations", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.getState().logout();
    useChatStore.getState().reset();
    useUIStore.getState().reset();
    context = createQueryWrapper();
  });
  afterEach(() => {
    context.client.clear();
    vi.useRealTimers();
  });

  it("stores credentials and shows the loading transition after password login", async () => {
    vi.mocked(authService.login).mockResolvedValue({ token: "jwt-token", user });
    const { result } = renderHook(useLogin, context);
    const input = { email: user.email, password: "Strong!123", captcha_token: "captcha" };
    await act(() => result.current.mutateAsync(input));
    expect(authService.login).toHaveBeenCalledWith(input);
    expect(useAuthStore.getState()).toMatchObject({
      token: "jwt-token",
      user,
      isAuthenticated: true,
    });
    expect(useUIStore.getState()).toMatchObject({
      globalLoading: true,
      loadingMessage: "Logging In",
    });
  });

  it("does not authenticate or retry rejected credentials", async () => {
    vi.mocked(authService.login).mockRejectedValue(new Error("Denied"));
    const { result } = renderHook(useLogin, context);
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          email: user.email,
          password: "wrong",
          captcha_token: "captcha",
        })
      ).rejects.toThrow("Denied");
    });
    expect(authService.login).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useUIStore.getState().globalLoading).toBe(false);
  });

  it("Google login establishes the same authenticated state", async () => {
    vi.mocked(authService.googleLogin).mockResolvedValue({ token: "google-jwt", user });
    const { result } = renderHook(useGoogleLogin, context);
    await act(() => result.current.mutateAsync({ code: "oauth-code", state: "oauth-state" }));
    expect(useAuthStore.getState()).toMatchObject({
      token: "google-jwt",
      user,
      isAuthenticated: true,
    });
    expect(useUIStore.getState().globalLoading).toBe(true);
  });

  it("registration returns the response without implicitly logging the user in", async () => {
    vi.mocked(authService.register).mockResolvedValue({ token: "pending", user });
    const { result } = renderHook(useRegister, context);
    await act(async () => {
      expect(
        await result.current.mutateAsync({
          email: user.email,
          password: "Strong!123",
          full_name: user.full_name,
          username: user.username,
          code: "123456",
          captcha_token: "captcha",
        })
      ).toEqual({ token: "pending", user });
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("returns the Google authorization URL supplied by the API", async () => {
    vi.mocked(authService.initGoogleAuth).mockResolvedValue({
      auth_url: "https://accounts.google.com/authorize?state=123",
      state: "123",
      expires_in_seconds: 300,
    });
    const { result } = renderHook(useInitGoogleAuth, context);
    await act(async () => {
      expect(await result.current.mutateAsync()).toEqual({
        auth_url: "https://accounts.google.com/authorize?state=123",
        state: "123",
        expires_in_seconds: 300,
      });
    });
  });

  it("invalidates only the current user after changing email", async () => {
    context.client.setQueryData(["user", "current"], user);
    context.client.setQueryData(["user", "other"], { ...user, id: "u2" });
    vi.mocked(authService.changeEmail).mockResolvedValue(undefined);
    const { result } = renderHook(useChangeEmail, context);
    const input = { email: "new@example.com", code: "123456" };
    await act(() => result.current.mutateAsync(input));
    expect(authService.changeEmail).toHaveBeenCalledWith(input);
    expect(context.client.getQueryState(["user", "current"])?.isInvalidated).toBe(true);
    expect(context.client.getQueryState(["user", "other"])?.isInvalidated).toBe(false);
  });

  it("never retries a password change rejected as bad input", async () => {
    const error = new AxiosError("Bad password");
    error.response = { status: 400 } as never;
    vi.mocked(authService.changePassword).mockRejectedValue(error);
    const { result } = renderHook(useChangePassword, context);
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          new_password: "Strong!123",
          confirm_password: "Strong!123",
          old_password: "Old!1234",
        })
      ).rejects.toThrow("Bad password");
    });
    expect(authService.changePassword).toHaveBeenCalledTimes(1);
  });

  it("retries a transient password-change failure twice then surfaces the error", async () => {
    vi.useFakeTimers();
    vi.mocked(authService.changePassword).mockRejectedValue(new Error("Offline"));
    const { result } = renderHook(useChangePassword, context);
    await act(async () => {
      const mutation = result.current
        .mutateAsync({ new_password: "Strong!123", confirm_password: "Strong!123" })
        .catch((error: Error) => error.message);
      await vi.advanceTimersByTimeAsync(4000);
      expect(await mutation).toBe("Offline");
    });
    expect(authService.changePassword).toHaveBeenCalledTimes(3);
  });

  it("forwards password reset verification without creating a session", async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined);
    const { result } = renderHook(useResetPassword, context);
    const input = {
      email: user.email,
      password: "Strong!123",
      confirm_password: "Strong!123",
      code: "123456",
      captcha_token: "captcha",
    };
    await act(() => result.current.mutateAsync(input));
    expect(authService.resetPassword).toHaveBeenCalledWith(input);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("forwards account deletion verification to the server", async () => {
    vi.mocked(authService.deleteAccount).mockResolvedValue(undefined);
    const { result } = renderHook(useDeleteAccount, context);
    const input = { password: "Strong!123" };
    await act(() => result.current.mutateAsync(input));
    expect(authService.deleteAccount).toHaveBeenCalledWith(input);
  });

  it.each([false, true])(
    "clears all local session state on logout, including server failure=%s",
    async (fails) => {
      useAuthStore.getState().setCredentials("jwt", user);
      useChatStore.getState().setActiveChatId("chat-1");
      useChatStore.getState().setUserTyping("chat-1", "u2", true);
      useUIStore.getState().setGlobalLoading(true, "Pending");
      context.client.setQueryData(["private-data"], { secret: true });
      if (fails) vi.mocked(authService.logout).mockRejectedValue(new Error("Offline"));
      else vi.mocked(authService.logout).mockResolvedValue(undefined);
      const { result } = renderHook(useLogout, context);
      await act(() => result.current());
      expect(useAuthStore.getState()).toMatchObject({
        token: null,
        user: null,
        isAuthenticated: false,
      });
      expect(useChatStore.getState()).toMatchObject({ activeChatId: null, typingUsers: {} });
      expect(useUIStore.getState().globalLoading).toBe(false);
      expect(context.client.getQueryData(["private-data"])).toBeUndefined();
    }
  );
});
