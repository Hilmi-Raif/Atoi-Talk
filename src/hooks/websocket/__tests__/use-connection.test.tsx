import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnection } from "../use-connection";

vi.mock("@/lib/logger", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  constructor(public url: string) {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "closed", wasClean: true });
  }
}

describe("WebSocket connection lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Socket.instances = [];
    vi.stubGlobal("WebSocket", Socket);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function setup(token: string | null = "a token&value") {
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const hook = renderHook(
      ({ credential }) =>
        useConnection("wss://chat.example/ws?existing=1", credential, onOpen, onMessage),
      { initialProps: { credential: token } }
    );
    return { ...hook, onOpen, onMessage };
  }
  it("does not create a socket for an anonymous session", () => {
    const { result } = setup(null);
    expect(Socket.instances).toHaveLength(0);
    expect(result.current.isConnected).toBe(false);
  });
  it("encodes credentials, forwards messages, and updates connection state", () => {
    const { result, onOpen, onMessage } = setup();
    const socket = Socket.instances[0];
    expect(new URL(socket.url).searchParams.get("token")).toBe("a token&value");
    expect(new URL(socket.url).searchParams.get("existing")).toBe("1");
    act(() => socket.open());
    expect(result.current.isConnected).toBe(true);
    expect(onOpen).toHaveBeenCalledOnce();
    const event = new MessageEvent("message", { data: "hello" });
    act(() => socket.onmessage?.(event));
    expect(onMessage).toHaveBeenCalledWith(event);
    act(() => socket.close());
    expect(result.current.isConnected).toBe(false);
  });
  it("uses exponential retry delays capped at thirty seconds and stops after ten attempts", () => {
    setup();
    for (let attempt = 0; attempt < 10; attempt++) {
      act(() => Socket.instances.at(-1)!.close());
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(Socket.instances).toHaveLength(attempt + 1);
      act(() => vi.advanceTimersByTime(1));
      expect(Socket.instances).toHaveLength(attempt + 2);
    }
    act(() => Socket.instances.at(-1)!.close());
    act(() => vi.advanceTimersByTime(120000));
    expect(Socket.instances).toHaveLength(11);
  });
  it("resets the retry delay after a successful reconnection", () => {
    setup();
    act(() => Socket.instances[0].close());
    act(() => vi.advanceTimersByTime(1000));
    act(() => Socket.instances[1].open());
    act(() => Socket.instances[1].close());
    act(() => vi.advanceTimersByTime(1000));
    expect(Socket.instances).toHaveLength(3);
  });
  it("cancels pending reconnects on unmount", () => {
    const { unmount } = setup();
    act(() => Socket.instances[0].close());
    unmount();
    act(() => vi.advanceTimersByTime(30000));
    expect(Socket.instances).toHaveLength(1);
  });
  it("closes the old session and reconnects with changed credentials", () => {
    const { rerender, result } = setup("old");
    act(() => Socket.instances[0].open());
    rerender({ credential: "new" });
    expect(Socket.instances[0].readyState).toBe(3);
    expect(new URL(Socket.instances[1].url).searchParams.get("token")).toBe("new");
    expect(result.current.isConnected).toBe(false);
    rerender({ credential: null });
    act(() => vi.advanceTimersByTime(30000));
    expect(Socket.instances).toHaveLength(2);
  });
  it.each([Socket.OPEN, Socket.CONNECTING])(
    "does not duplicate an externally owned active socket in state %s",
    (readyState) => {
      const socket = new Socket("wss://existing.example");
      socket.readyState = readyState;
      const ref = { current: socket as unknown as WebSocket | null };
      const onOpen = vi.fn();
      const onMessage = vi.fn();
      const { result } = renderHook(() =>
        useConnection("wss://chat.example/ws", "session", onOpen, onMessage, ref)
      );
      expect(Socket.instances).toHaveLength(1);
      expect(result.current.wsRef).toBe(ref);
    }
  );
});
