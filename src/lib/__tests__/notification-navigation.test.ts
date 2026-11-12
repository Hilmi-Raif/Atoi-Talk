import { describe, expect, it, vi } from "vitest";
import { listenForNotificationNavigation, openNotificationChat } from "../notification-navigation";

describe("notification navigation", () => {
  it("ignores malformed local routes and unrelated worker messages", () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    const worker = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: worker });
    const navigate = vi.fn();
    const stop = listenForNotificationNavigation(navigate);
    try {
      for (const detail of [
        undefined,
        {},
        { path: 42 },
        { path: "https://evil.test" },
        { path: "/chat/invalid" },
      ]) {
        window.dispatchEvent(new CustomEvent("notification:navigate", { detail }));
      }
      worker.dispatchEvent(new MessageEvent("message", { data: null }));
      worker.dispatchEvent(new MessageEvent("message", { data: { type: "other" } }));
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      stop();
      if (previous) Object.defineProperty(navigator, "serviceWorker", previous);
      else Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
  it("supports local navigation and cleanup when service workers are unavailable", () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    const navigate = vi.fn();
    const stop = listenForNotificationNavigation(navigate);
    try {
      openNotificationChat();
      expect(navigate).toHaveBeenCalledWith("/chat");
      stop();
      openNotificationChat();
      expect(navigate).toHaveBeenCalledOnce();
    } finally {
      stop();
      if (previous) Object.defineProperty(navigator, "serviceWorker", previous);
      else Reflect.deleteProperty(navigator, "serviceWorker");
    }
  });
  it("routes foreground and worker clicks without reloading, and cleans up", () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: worker });
    const navigate = vi.fn();
    const stop = listenForNotificationNavigation(navigate);
    const id = "01a14b27-6627-759f-9815-f4a1bb25bd6b";
    openNotificationChat(id);
    expect(navigate).toHaveBeenLastCalledWith(`/chat/${id}`);
    worker.dispatchEvent(
      new MessageEvent("message", { data: { type: "notification:navigate", chat_id: id } })
    );
    expect(navigate).toHaveBeenCalledTimes(2);
    worker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "notification:navigate", chat_id: "https://evil.test" },
      })
    );
    expect(navigate).toHaveBeenLastCalledWith("/chat");
    stop();
    openNotificationChat(id);
    expect(navigate).toHaveBeenCalledTimes(3);
  });
});
