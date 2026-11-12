import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store";
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
  },
});

const AUTH_ENDPOINTS_SKIP_AUTO_LOGOUT = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/reset-password",
  "/api/auth/google",
  "/api/auth/google/init",
  "/api/auth/logout",
]);

const resolveRequestPath = (url?: string): string => {
  if (!url) return "";

  try {
    return new URL(url, api.defaults.baseURL).pathname;
  } catch {
    return url;
  }
};

const hasBearerTokenHeader = (headers: unknown): boolean => {
  if (!headers || typeof headers !== "object") return false;

  const normalizedHeaders = headers as Record<string, unknown>;
  const auth =
    normalizedHeaders.Authorization ??
    normalizedHeaders.authorization ??
    (typeof (normalizedHeaders as { get?: (name: string) => unknown }).get === "function"
      ? (normalizedHeaders as { get: (name: string) => unknown }).get("Authorization")
      : undefined);

  return typeof auth === "string" && auth.startsWith("Bearer ");
};

api.interceptors.request.use(
  (config) => {
    if (
      import.meta.env.VITE_CAPTCHA_ENABLED === "false" &&
      config.data &&
      Object.getPrototypeOf(config.data) === Object.prototype
    ) {
      config.data = { ...config.data };
      delete config.data.captcha_token;
    }
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 401) {
      const requestPath = resolveRequestPath(error.config?.url);
      const requestMethod = error.config?.method?.toUpperCase() || "GET";
      const isAuthEndpoint = AUTH_ENDPOINTS_SKIP_AUTO_LOGOUT.has(requestPath);
      const hasAuthHeader = hasBearerTokenHeader(error.config?.headers);
      const hasSession = !!useAuthStore.getState().token;
      const shouldAutoLogout = hasSession && hasAuthHeader && !isAuthEndpoint;

      if (import.meta.env.DEV) {
        console.warn(
          `[Auth] 401 from ${requestMethod} ${requestPath || "(unknown path)"}:`,
          data?.error || "Unauthorized"
        );
      }

      if (shouldAutoLogout) {
        useAuthStore.getState().logout();

        const currentPath = window.location.pathname;
        if (
          !currentPath.startsWith("/login") &&
          !currentPath.startsWith("/register") &&
          !currentPath.startsWith("/forgot")
        ) {
          window.dispatchEvent(new Event("unauthorized"));
        }
      }
    }

    if (status === 429) {
      const message = data?.error || "Too many requests. Please try again later.";
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
