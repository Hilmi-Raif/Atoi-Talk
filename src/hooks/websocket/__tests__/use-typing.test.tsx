import { useChatStore } from "@/store";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTyping } from "../use-typing";

describe("WebSocket typing lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.getState().reset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    useChatStore.getState().reset();
  });
  function setup(socket: { readyState: number; send: ReturnType<typeof vi.fn> } | null = null) {
    const ref = { current: socket as unknown as WebSocket | null };
    return { ...renderHook(() => useTyping(ref, { id: "self" })), ref };
  }
  it.each([
    { meta: { chat_id: "chat", sender_id: "other" } },
    { payload: { chat_id: "chat", sender_id: "other" } },
    { payload: { chat_id: "chat", user_id: "other" } },
  ])(
    "accepts a supported event envelope and expires the indicator after five seconds: %j",
    (event) => {
      const { result } = setup();
      act(() => result.current.handleTypingEvent(event));
      expect(useChatStore.getState().typingUsers.chat).toEqual(["other"]);
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(useChatStore.getState().typingUsers.chat ?? []).toEqual([]);
      expect(result.current.typingTimeoutsRef.current).toEqual({});
    }
  );
  it("extends only the matching sender's deadline when another event arrives", () => {
    const { result } = setup();
    act(() => {
      result.current.handleTypingEvent({ meta: { chat_id: "chat", sender_id: "other" } });
      vi.advanceTimersByTime(3000);
      result.current.handleTypingEvent({ meta: { chat_id: "chat", sender_id: "other" } });
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useChatStore.getState().typingUsers.chat).toEqual(["other"]);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(useChatStore.getState().typingUsers.chat ?? []).toEqual([]);
  });
  it.each([
    {},
    { meta: { chat_id: "chat" } },
    { payload: { user_id: "other" } },
    { meta: { chat_id: "chat", sender_id: "self" } },
  ])("ignores incomplete or self-originating events: %j", (event) => {
    const { result } = setup();
    act(() => result.current.handleTypingEvent(event));
    expect(useChatStore.getState().typingUsers).toEqual({});
    expect(result.current.typingTimeoutsRef.current).toEqual({});
  });
  it("clears an existing timeout idempotently without clearing another sender's timer", () => {
    const { result } = setup();
    act(() => {
      result.current.handleTypingEvent({ meta: { chat_id: "chat", sender_id: "other" } });
      result.current.clearTypingTimeout("chat-other");
      result.current.clearTypingTimeout("missing");
    });
    expect(result.current.typingTimeoutsRef.current).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([null, WebSocket.CONNECTING, WebSocket.CLOSED, WebSocket.OPEN])(
    "publishes typing only through an open socket (state=%s)",
    (state) => {
      const send = vi.fn();
      const { result } = setup(state === null ? null : { readyState: state, send });
      act(() => result.current.sendTyping("chat"));
      if (state === WebSocket.OPEN)
        expect(send).toHaveBeenCalledWith(
          JSON.stringify({ type: "chat.typing", meta: { chat_id: "chat" } })
        );
      else expect(send).not.toHaveBeenCalled();
    }
  );
});
