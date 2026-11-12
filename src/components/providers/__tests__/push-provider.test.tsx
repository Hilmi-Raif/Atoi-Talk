import axios from "@/lib/axios";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { listenForPush, syncPush } from "@/lib/push";
import { pushConfigured } from "@/lib/push-config";
import { useAuthStore } from "@/store";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushProvider } from "../push-provider";

vi.mock("@/lib/push", () => ({ listenForPush: vi.fn(), syncPush: vi.fn() }));
vi.mock("@/lib/push-config", () => ({ pushConfigured: vi.fn() }));
vi.mock("@/lib/axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@/components/push-opt-in", () => ({ PushOptIn: () => null }));
describe("push provider lifecycle", () => {
  const stop = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(pushConfigured).mockReturnValue(true);
    vi.mocked(listenForPush).mockResolvedValue(stop);
    vi.mocked(syncPush).mockResolvedValue(undefined);
    vi.mocked(axios.get).mockResolvedValue({
      data: { data: { message_notifications_enabled: false } },
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    useAuthStore.setState({ token: "session", isAuthenticated: true });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.getState().logout();
    Reflect.deleteProperty(document, "visibilityState");
  });
  const setup = () =>
    render(
      <MemoryRouter>
        <PushProvider />
      </MemoryRouter>
    );
  const settle = () =>
    act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  it("resets stale preferences without registering push for an anonymous session", async () => {
    useAuthStore.getState().logout();
    useNotificationPreferences.setState({
      enabled: false,
      chats: [{ chat_id: "old", muted_forever: true }],
      loaded: true,
    });
    setup();
    await settle();
    expect(useNotificationPreferences.getState()).toMatchObject({
      enabled: true,
      chats: [],
      loaded: false,
    });
    expect(listenForPush).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });
  it("refreshes preferences even when browser push is not configured", async () => {
    vi.mocked(pushConfigured).mockReturnValue(false);
    setup();
    await settle();
    expect(useNotificationPreferences.getState()).toMatchObject({ enabled: false, loaded: true });
    expect(listenForPush).not.toHaveBeenCalled();
  });
  it("refreshes visible sessions on focus, online, visibility changes and the periodic timer", async () => {
    const view = setup();
    await settle();
    expect(syncPush).toHaveBeenCalledWith("session");
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle();
    expect(axios.get).toHaveBeenCalledTimes(3);
    expect(syncPush).toHaveBeenCalledTimes(3);
    await act(() => vi.advanceTimersByTimeAsync(30 * 60 * 1000));
    expect(syncPush).toHaveBeenCalledTimes(4);
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
    act(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => vi.advanceTimersByTimeAsync(30 * 60 * 1000));
    expect(syncPush).toHaveBeenCalledTimes(4);
    expect(axios.get).toHaveBeenCalledTimes(3);
  });
  it("does not synchronize hidden tabs until they become visible", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    setup();
    await settle();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(axios.get).not.toHaveBeenCalled();
    expect(syncPush).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await settle();
    expect(syncPush).toHaveBeenCalledOnce();
  });
  it("immediately disposes an asynchronously registered listener after unmount", async () => {
    let resolve!: (stop: () => void) => void;
    vi.mocked(listenForPush).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const view = setup();
    view.unmount();
    await act(async () => resolve(stop));
    expect(stop).toHaveBeenCalledOnce();
  });
  it("contains registration, synchronization and preference failures without leaking rejections", async () => {
    vi.mocked(listenForPush).mockRejectedValue(new Error("unsupported"));
    vi.mocked(syncPush).mockRejectedValue(new Error("offline"));
    vi.mocked(axios.get).mockRejectedValue(new Error("offline"));
    setup();
    await settle();
    expect(useNotificationPreferences.getState().loaded).toBe(false);
    act(() => window.dispatchEvent(new Event("online")));
    await settle();
    expect(syncPush).toHaveBeenCalledTimes(2);
  });
});
