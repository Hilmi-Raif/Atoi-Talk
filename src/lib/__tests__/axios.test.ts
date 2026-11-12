import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store";
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../axios";

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
const user = {
  id: "u1",
  email: "person@example.com",
  full_name: "Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
};

describe("API authentication interceptors", () => {
  const originalAdapter = api.defaults.adapter;
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().logout();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    api.defaults.adapter = originalAdapter;
    useAuthStore.getState().logout();
  });

  it.each(["false", "true", undefined])(
    "handles captcha request fields with flag %s",
    async (flag) => {
      vi.stubEnv("VITE_CAPTCHA_ENABLED", flag);
      const payload = { email: "person@example.com", captcha_token: "widget-response" };
      api.defaults.adapter = async (config) => {
        const body = JSON.parse(config.data);
        expect(body).toEqual(flag === "false" ? { email: payload.email } : payload);
        return { status: 200, statusText: "OK", data: null, headers: new AxiosHeaders(), config };
      };
      await api.post("/api/auth/login", payload);
      expect(payload.captcha_token).toBe("widget-response");
    }
  );

  function rejectWith(status: number, data: unknown = {}) {
    api.defaults.adapter = async (config) => {
      const response: AxiosResponse = {
        status,
        statusText: "Rejected",
        data,
        headers: new AxiosHeaders(),
        config,
      };
      throw new AxiosError("Request rejected", "ERR_BAD_REQUEST", config, undefined, response);
    };
  }

  it("attaches the current token and returns the unchanged successful response", async () => {
    useAuthStore.getState().setCredentials("fresh-jwt", user);
    let observed: InternalAxiosRequestConfig | undefined;
    api.defaults.adapter = async (config) => {
      observed = config;
      return {
        status: 200,
        statusText: "OK",
        data: { result: "ok" },
        headers: new AxiosHeaders(),
        config,
      };
    };
    const response = await api.get("/api/user/current");
    expect(observed?.headers.get("Authorization")).toBe("Bearer fresh-jwt");
    expect(response.data).toEqual({ result: "ok" });
  });

  it("does not invent a bearer header for anonymous requests", async () => {
    api.defaults.adapter = async (config) => {
      expect(config.headers.has("Authorization")).toBe(false);
      return { status: 200, statusText: "OK", data: null, headers: new AxiosHeaders(), config };
    };
    await api.get("/public");
  });

  it.each([
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/reset-password",
    "/api/auth/google",
    "/api/auth/google/init",
    "/api/auth/logout",
  ])("keeps the session on a 401 from %s", async (path) => {
    useAuthStore.getState().setCredentials("jwt", user);
    rejectWith(401);
    await expect(api.post(path)).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().token).toBe("jwt");
  });

  it("resolves absolute auth endpoint URLs before deciding whether to logout", async () => {
    useAuthStore.getState().setCredentials("jwt", user);
    rejectWith(401);
    await expect(
      api.get("https://api.example.com/api/auth/google/init?state=x")
    ).rejects.toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("clears an expired protected session and dispatches one navigation event", async () => {
    useAuthStore.getState().setCredentials("jwt", user);
    rejectWith(401, { error: "Expired" });
    const unauthorized = vi.fn();
    window.addEventListener("unauthorized", unauthorized);
    try {
      await expect(api.get("/api/user/current")).rejects.toBeInstanceOf(AxiosError);
      expect(useAuthStore.getState().token).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(unauthorized).toHaveBeenCalledTimes(1);
      await expect(api.get("/api/user/current")).rejects.toBeInstanceOf(AxiosError);
      expect(unauthorized).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("unauthorized", unauthorized);
    }
  });

  it.each(["Slow down", undefined])(
    "reports a rate limit without clearing the session (%s)",
    async (message) => {
      useAuthStore.getState().setCredentials("jwt", user);
      rejectWith(429, { error: message });
      await expect(api.get("/api/chats")).rejects.toMatchObject({ response: { status: 429 } });
      expect(toast.error).toHaveBeenCalledWith(
        message || "Too many requests. Please try again later."
      );
      expect(useAuthStore.getState().token).toBe("jwt");
    }
  );

  it("preserves the session and original error for non-auth failures", async () => {
    useAuthStore.getState().setCredentials("jwt", user);
    rejectWith(503, { error: "Unavailable" });
    await expect(api.get("/api/chats")).rejects.toMatchObject({
      response: { status: 503, data: { error: "Unavailable" } },
    });
    expect(useAuthStore.getState().token).toBe("jwt");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("propagates network failures without manufacturing an HTTP response", async () => {
    api.defaults.adapter = async () => {
      throw new Error("Network unavailable");
    };
    await expect(api.get("/api/chats")).rejects.toThrow("Network unavailable");
    expect(toast.error).not.toHaveBeenCalled();
  });
});
