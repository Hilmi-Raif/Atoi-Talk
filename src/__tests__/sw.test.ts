import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  precacheAndRoute: vi.fn(),
  cleanupOutdatedCaches: vi.fn(),
  clientsClaim: vi.fn(),
  createHandlerBoundToURL: vi.fn(() => "app-shell"),
  registerRoute: vi.fn(),
  configured: false,
  supported: true,
  initializeApp: vi.fn(() => "firebase-app"),
  getMessaging: vi.fn(() => "messaging"),
  onBackgroundMessage: vi.fn(),
}));
vi.mock("workbox-core", () => ({ clientsClaim: boundary.clientsClaim }));
vi.mock("workbox-precaching", () => ({
  precacheAndRoute: boundary.precacheAndRoute,
  cleanupOutdatedCaches: boundary.cleanupOutdatedCaches,
  createHandlerBoundToURL: boundary.createHandlerBoundToURL,
}));
vi.mock("workbox-routing", () => ({
  registerRoute: boundary.registerRoute,
  NavigationRoute: class {
    constructor(
      public handler: unknown,
      public options: unknown
    ) {}
  },
}));
vi.mock("firebase/app", () => ({ initializeApp: boundary.initializeApp }));
vi.mock("firebase/messaging/sw", () => ({
  isSupported: () => Promise.resolve(boundary.supported),
  getMessaging: boundary.getMessaging,
  onBackgroundMessage: boundary.onBackgroundMessage,
}));
vi.mock("../lib/push-config", async (original) => ({
  ...(await original<typeof import("../lib/push-config")>()),
  pushConfigured: () => boundary.configured,
}));

describe("service worker notification routing", () => {
  let listener: (event: never) => void;
  let worker: {
    __WB_MANIFEST: { url: string; revision: string }[];
    skipWaiting: ReturnType<typeof vi.fn>;
    clients: { matchAll: ReturnType<typeof vi.fn>; openWindow: ReturnType<typeof vi.fn> };
    location: { origin: string };
    addEventListener: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    boundary.configured = false;
    boundary.supported = true;
    worker = {
      __WB_MANIFEST: [{ url: "index.html", revision: "test" }],
      skipWaiting: vi.fn(),
      clients: {
        matchAll: vi.fn().mockResolvedValue([]),
        openWindow: vi.fn().mockResolvedValue(undefined),
      },
      location: { origin: "https://chat.example.com" },
      addEventListener: vi.fn((_type, handler) => {
        listener = handler;
      }),
    };
    vi.stubGlobal("self", worker);
  });
  afterEach(() => vi.unstubAllGlobals());
  async function load() {
    await import("../sw");
    await Promise.resolve();
  }
  async function click(data: unknown) {
    let pending: Promise<unknown> | undefined;
    const event = {
      notification: { data, close: vi.fn() },
      stopImmediatePropagation: vi.fn(),
      waitUntil: vi.fn((promise: Promise<unknown>) => {
        pending = promise;
      }),
    };
    listener(event as never);
    await pending;
    return event;
  }
  it("initializes the app shell while leaving API navigation outside the fallback", async () => {
    await load();
    expect(boundary.precacheAndRoute).toHaveBeenCalledWith(worker.__WB_MANIFEST);
    expect(boundary.cleanupOutdatedCaches).toHaveBeenCalledOnce();
    expect(boundary.clientsClaim).toHaveBeenCalledOnce();
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
    expect(boundary.registerRoute).toHaveBeenCalledWith(
      expect.objectContaining({ handler: "app-shell", options: { denylist: [/^\/api\//] } })
    );
    expect(boundary.initializeApp).not.toHaveBeenCalled();
  });
  it.each([undefined, {}, { FCM_MSG: { data: {} } }])(
    "ignores a notification without a chat destination: %j",
    async (data) => {
      await load();
      const event = await click(data);
      expect(event.notification.close).not.toHaveBeenCalled();
      expect(event.waitUntil).not.toHaveBeenCalled();
      expect(worker.clients.matchAll).not.toHaveBeenCalled();
    }
  );
  it.each([false, true])(
    "focuses an existing same-origin tab for a notification (FCM envelope=%s)",
    async (nested) => {
      const focus = vi.fn().mockResolvedValue(undefined),
        postMessage = vi.fn();
      worker.clients.matchAll.mockResolvedValue([
        { url: "https://other.example.com/chat", focus: vi.fn() },
        { url: "https://chat.example.com/chat", focus, postMessage },
      ]);
      await load();
      const data = { chat_id: "chat-1" };
      const event = await click(nested ? { FCM_MSG: { data } } : data);
      expect(event.notification.close).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledWith({
        type: "notification:navigate",
        chat_id: "chat-1",
      });
      expect(focus).toHaveBeenCalledOnce();
      expect(worker.clients.openWindow).not.toHaveBeenCalled();
    }
  );
  it("opens a chat window when all existing windows belong to other origins", async () => {
    worker.clients.matchAll.mockResolvedValue([{ url: "https://elsewhere.example.com/" }]);
    const chatId = "11111111-1111-4111-8111-111111111111";
    await load();
    await click({ chat_id: chatId });
    expect(worker.clients.openWindow).toHaveBeenCalledWith(
      `https://chat.example.com/chat/${chatId}`
    );
  });
  it.each([false, true])(
    "initializes Firebase only when configured and supported=%s",
    async (supported) => {
      boundary.configured = true;
      boundary.supported = supported;
      await load();
      expect(boundary.onBackgroundMessage).toHaveBeenCalledTimes(supported ? 1 : 0);
      if (supported) {
        expect(boundary.getMessaging).toHaveBeenCalledWith("firebase-app");
        const callback = boundary.onBackgroundMessage.mock.calls[0][1];
        expect(callback()).toBeUndefined();
        expect(worker.clients.openWindow).not.toHaveBeenCalled();
      }
    }
  );
});
