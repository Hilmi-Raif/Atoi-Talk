import { describe, expect, it, vi } from "vitest";
import { listenForNotificationNavigation, openNotificationChat } from "../notification-navigation";

describe("notification navigation", () => {
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
