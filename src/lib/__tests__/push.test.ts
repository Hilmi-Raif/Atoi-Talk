vi.mock("@/lib/axios", () => ({ default: { get: vi.fn(), put: vi.fn() } }));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  delete: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
  onMessage: vi.fn(),
  permission: vi.fn(),
  supported: vi.fn(),
}));
vi.mock("axios", () => ({ default: { put: mocks.put, delete: mocks.delete } }));
vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
  getApp: () => ({}),
}));
vi.mock("firebase/messaging", () => ({
  getMessaging: () => ({}),
  getToken: mocks.getToken,
  deleteToken: mocks.deleteToken,
  isSupported: mocks.supported,
  onMessage: mocks.onMessage,
}));
vi.mock("../toast", () => ({ toast: { info: vi.fn() } }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubEnv("VITE_PUSH_ENABLED", "true");
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080");
  for (const name of ["API_KEY", "PROJECT_ID", "MESSAGING_SENDER_ID", "APP_ID", "VAPID_KEY"])
    vi.stubEnv(`VITE_FIREBASE_${name}`, "configured");
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: mocks.permission });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({
        scope: "/",
        pushManager: {
          getSubscription: vi
            .fn()
            .mockResolvedValue({ unsubscribe: vi.fn().mockResolvedValue(true) }),
        },
      }),
      ready: Promise.resolve({ scope: "/" }),
    },
  });
  mocks.permission.mockResolvedValue("granted");
  mocks.supported.mockResolvedValue(true);
  mocks.getToken.mockResolvedValue("fcm-token");
  mocks.deleteToken.mockResolvedValue(true);
  mocks.put.mockResolvedValue({});
  mocks.delete.mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("browser push lifecycle", () => {
  it.each(["insecure", "unsupported", "unconfigured"])(
    "does not opt in when the browser is %s",
    async (condition) => {
      if (condition === "insecure") vi.stubGlobal("isSecureContext", false);
      if (condition === "unsupported") mocks.supported.mockResolvedValue(false);
      if (condition === "unconfigured") vi.stubEnv("VITE_PUSH_ENABLED", "false");
      const { enablePush } = await import("../push");
      await expect(enablePush("session")).rejects.toThrow();
      expect(mocks.put).not.toHaveBeenCalled();
      expect(localStorage.getItem("atoitalk-push-enabled")).toBeNull();
    }
  );
  it.each(["empty token", "provider failure", "registration failure"])(
    "permits a fresh opt in after %s",
    async (failure) => {
      if (failure === "empty token") mocks.getToken.mockResolvedValueOnce("");
      if (failure === "provider failure")
        mocks.getToken.mockRejectedValueOnce(new Error("provider offline"));
      if (failure === "registration failure")
        mocks.put.mockRejectedValueOnce(new Error("API offline"));
      const { enablePush } = await import("../push");
      await expect(enablePush("old-session")).rejects.toThrow();
      expect(localStorage.getItem("atoitalk-push-enabled")).toBeNull();
      await enablePush("new-session");
      expect(mocks.put.mock.lastCall?.[2].headers.Authorization).toBe("Bearer new-session");
      expect(localStorage.getItem("atoitalk-push-enabled")).toBe("true");
    }
  );
  it("routes a foreground notification action to its chat and returns the SDK unsubscribe", async () => {
    const unsubscribe = vi.fn();
    mocks.onMessage.mockReturnValueOnce(unsubscribe);
    const { listenForPush } = await import("../push");
    const { useNotificationPreferences } = await import("../notification-preferences");
    const { toast } = await import("../toast");
    useNotificationPreferences.setState({ loaded: true, enabled: true, chats: [] });
    const navigate = vi.fn();
    window.addEventListener("notification:navigate", navigate);
    try {
      const stop = await listenForPush();
      mocks.onMessage.mock.calls[0][1]({
        data: {
          chat_id: "11111111-1111-4111-8111-111111111111",
          title: "Sender",
          body: "Preview",
          event_id: "event-click",
        },
      });
      expect(toast.info).toHaveBeenCalledWith(
        "Sender",
        expect.objectContaining({ description: "Preview", id: "event-click" })
      );
      const options = vi.mocked(toast.info).mock.lastCall?.[1];
      options?.action?.onClick();
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({ detail: { path: "/chat/11111111-1111-4111-8111-111111111111" } })
      );
      stop?.();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("notification:navigate", navigate);
    }
  });
  it("only prompts after opt-in and preserves installation ownership when rebinding", async () => {
    const { enablePush, syncPush } = await import("../push");
    await syncPush("session-one");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
    await enablePush("session-one");
    const first = mocks.put.mock.calls[0];
    expect(first[1]).toMatchObject({ token: "fcm-token", platform: "web" });
    expect(first[1].device_secret.length).toBeGreaterThanOrEqual(32);
    mocks.getToken.mockResolvedValue("rotated-token");
    await syncPush("session-two");
    expect(mocks.put.mock.calls[1][0]).toBe(first[0]);
    expect(mocks.put.mock.calls[1][1].device_secret).toBe(first[1].device_secret);
    expect(mocks.put.mock.calls[1][2].headers.Authorization).toBe("Bearer session-two");
  });
  it("does not register after denied permission", async () => {
    vi.stubGlobal("Notification", { permission: "default", requestPermission: mocks.permission });
    mocks.permission.mockResolvedValue("denied");
    const { enablePush } = await import("../push");
    await expect(enablePush("session")).rejects.toThrow("Allow notifications");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(localStorage.getItem("atoitalk-push-enabled")).toBeNull();
  });
  it("deletes the browser token even if unregister is offline and does not resubscribe", async () => {
    const { enablePush, disablePush, syncPush } = await import("../push");
    await enablePush("session");
    mocks.delete.mockRejectedValue(new Error("offline"));
    await expect(disablePush("session")).rejects.toThrow("offline");
    expect(mocks.deleteToken).toHaveBeenCalledOnce();
    expect(localStorage.getItem("atoitalk-push-enabled")).toBeNull();
    await syncPush("new-session");
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it("uses the existing app worker when disabling after a page reload", async () => {
    localStorage.setItem("atoitalk-push-enabled", "true");
    const registration = await navigator.serviceWorker.getRegistration();
    const { disablePush } = await import("../push");
    await disablePush("session");
    expect(mocks.getToken).toHaveBeenCalledWith(expect.anything(), {
      vapidKey: "configured",
      serviceWorkerRegistration: registration,
    });
    expect(mocks.deleteToken).toHaveBeenCalledOnce();
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("does not create a push subscription when disabling an unsubscribed browser", async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    vi.mocked(registration!.pushManager.getSubscription).mockResolvedValue(null);
    const { disablePush } = await import("../push");
    await disablePush("session");
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.deleteToken).not.toHaveBeenCalled();
  });
  it("gives an actionable error without an active worker", async () => {
    vi.mocked(navigator.serviceWorker.getRegistration).mockResolvedValue(undefined);
    const { enablePush } = await import("../push");
    await expect(enablePush("session")).rejects.toThrow("Build the app");
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it("times out a hanging subscription, permits retry and ignores late results", async () => {
    vi.useFakeTimers();
    let complete!: (token: string) => void;
    mocks.getToken.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const { enablePush } = await import("../push");
    const failed = expect(enablePush("old-session")).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(31000);
    await failed;
    expect(mocks.put).not.toHaveBeenCalled();
    expect(localStorage.getItem("atoitalk-push-enabled")).toBeNull();
    await enablePush("new-session");
    expect(mocks.put).toHaveBeenCalledOnce();
    complete("late-token");
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.put.mock.calls[0][2].headers.Authorization).toBe("Bearer new-session");
  });
  it("suppresses foreground alerts for global off and muted chats", async () => {
    const { listenForPush } = await import("../push");
    const { useNotificationPreferences } = await import("../notification-preferences");
    const { toast } = await import("../toast");
    await listenForPush();
    const callback = mocks.onMessage.mock.calls[0][1];
    const payload = { data: { chat_id: "chat-a", event_id: "event-a" } };
    useNotificationPreferences.setState({ loaded: true, enabled: false, chats: [] });
    callback(payload);
    expect(toast.info).not.toHaveBeenCalled();
    useNotificationPreferences.setState({
      enabled: true,
      chats: [{ chat_id: "chat-a", muted_forever: true }],
    });
    callback(payload);
    expect(toast.info).not.toHaveBeenCalled();
    useNotificationPreferences.setState({ chats: [] });
    callback(payload);
    expect(toast.info).toHaveBeenCalledOnce();
  });
  it("shows the sender and preview without activating global loading", async () => {
    const { listenForPush, enablePush } = await import("../push");
    const { useNotificationPreferences } = await import("../notification-preferences");
    const { useUIStore } = await import("@/store");
    const { toast } = await import("../toast");
    const changes = vi.fn();
    const stop = useUIStore.subscribe(changes);
    useNotificationPreferences.setState({ loaded: true, enabled: true, chats: [] });
    await enablePush("session");
    await listenForPush();
    mocks.onMessage.mock.calls[0][1]({
      notification: { title: "Alya", body: "Halo" },
      data: { event_id: "event" },
    });
    expect(toast.info).toHaveBeenCalledWith(
      "Alya",
      expect.objectContaining({ description: "Halo" })
    );
    expect(changes).not.toHaveBeenCalled();
    stop();
  });
});
