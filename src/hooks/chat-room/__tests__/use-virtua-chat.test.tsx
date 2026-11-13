import { Message } from "@/types";
import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { VListHandle } from "virtua";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVirtuaChat } from "../use-virtua-chat";

type Options = Parameters<typeof useVirtuaChat>[0];
const message = (id: string, day = 1): Message =>
  ({ id, created_at: `2026-01-${String(day).padStart(2, "0")}T12:00:00Z` }) as Message;
function setup(overrides: Partial<Options> = {}) {
  const viewport = {
    scrollOffset: 800,
    scrollSize: 2000,
    viewportSize: 500,
    scrollToIndex: vi.fn(),
    scrollTo: vi.fn(),
    findItemIndex: vi.fn(() => 1),
  };
  const options: Options = {
    messages: [message("m1"), message("m2")],
    hasNextPage: false,
    hasPreviousPage: false,
    isFetchingNextPage: false,
    isFetchingPreviousPage: false,
    isErrorNextPage: false,
    isErrorPreviousPage: false,
    fetchNextPage: vi.fn(),
    fetchPreviousPage: vi.fn(),
    currentChatId: "chat1",
    ...overrides,
  };
  const hook = renderHook(
    (props: Options) => {
      const chat = useVirtuaChat(props);
      useLayoutEffect(() => {
        chat.virtualizerRef.current = viewport as unknown as VListHandle;
        return () => {
          chat.virtualizerRef.current = null;
        };
      }, [chat.virtualizerRef]);
      return chat;
    },
    { initialProps: options }
  );
  return { ...hook, viewport, options };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 1)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useVirtuaChat", () => {
  it("preserves the reader's position when a new message arrives away from the bottom", () => {
    const { result, viewport, rerender, options } = setup();
    act(() => vi.advanceTimersByTime(1000));
    viewport.scrollOffset = 400;
    act(() => result.current.handleScroll(400));
    viewport.scrollTo.mockClear();
    rerender({ ...options, messages: [...options.messages, message("m3")] });
    act(() => vi.advanceTimersByTime(300));
    expect(viewport.scrollTo).not.toHaveBeenCalled();
    expect(result.current.showScrollButton).toBe(true);
  });

  it.each([{ hasPreviousPage: true }, { isJumping: true }])(
    "does not follow viewport resizing while browsing history: %j",
    (flags) => {
      const viewportEvents = new EventTarget();
      vi.stubGlobal("visualViewport", viewportEvents);
      const { viewport } = setup(flags);
      act(() => vi.advanceTimersByTime(1000));
      viewport.scrollTo.mockClear();
      act(() => {
        viewportEvents.dispatchEvent(new Event("resize"));
        viewportEvents.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(10);
      });
      expect(viewport.scrollTo).not.toHaveBeenCalled();
    }
  );

  it("rearms newer-page fetching when the history window changes", () => {
    const { result, options, rerender } = setup({ hasPreviousPage: true });
    act(() => result.current.handleScroll(1500));
    rerender({ ...options, messages: [...options.messages, message("m3")] });
    act(() => result.current.handleScroll(1500));
    expect(options.fetchPreviousPage).toHaveBeenCalledTimes(2);
  });

  it("does not fabricate a sticky date for an unresolved viewport index", () => {
    const { result, viewport } = setup();
    viewport.findItemIndex.mockReturnValue(-1);
    act(() => result.current.handleScroll(500));
    expect(result.current.activeStickyDate).toBeNull();
    viewport.findItemIndex.mockReturnValue(999);
    act(() => result.current.handleScroll(500));
    expect(result.current.activeStickyDate).toBeNull();
  });

  it("orders same-second messages by their sortable identifiers across history pages", () => {
    const oldest = message("01a1ce92-9dc2-7c69-af8c-4946aa75e93d");
    const middle = message("01a1ce92-9e10-71a3-9ac2-3fa3d0f67fa0");
    const newest = message("01a1ce92-9f59-711e-87ad-e4869631f2c4");
    const messages = [newest, middle, oldest];
    const { result } = setup({ messages });
    expect(
      result.current.items.filter((item) => item.type === "message").map((item) => item.id)
    ).toEqual([oldest.id, middle.id, newest.id]);
    expect(messages.map((item) => item.id)).toEqual([newest.id, middle.id, oldest.id]);
  });
  it("sorts history chronologically without mutating it and separates each date", () => {
    const messages = [message("later", 2), message("first"), message("second")];
    const { result } = setup({ messages });
    expect(
      result.current.items.map((item) => (item.type === "message" ? item.id : item.type))
    ).toEqual(["date-separator", "first", "second", "date-separator", "later"]);
    expect(messages[0].id).toBe("later");
  });

  it.each([false, true])("renders pagination boundaries with error=%s", (failed) => {
    const { result } = setup({
      hasNextPage: true,
      hasPreviousPage: true,
      isErrorNextPage: failed,
      isErrorPreviousPage: failed,
    });
    expect(result.current.items[0]).toMatchObject(
      failed ? { type: "error", direction: "up" } : { type: "loader", id: "loader-top" }
    );
    expect(result.current.items.at(-1)).toMatchObject(
      failed ? { type: "error", direction: "down" } : { type: "loader", id: "loader-bottom" }
    );
  });

  it("aligns initial history to the latest item before displaying it", () => {
    const { result, viewport } = setup();
    expect(result.current.isReadyToDisplay).toBe(false);
    expect(viewport.scrollToIndex).toHaveBeenCalledWith(2, { align: "end" });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.isReadyToDisplay).toBe(true);
    expect(viewport.scrollTo).toHaveBeenCalledWith(2000);
  });

  it("does not attempt to scroll empty history", () => {
    const { result, viewport } = setup({ messages: [] });
    act(() => result.current.scrollToBottom());
    expect(viewport.scrollTo).not.toHaveBeenCalled();
    expect(result.current.isReadyToDisplay).toBe(false);
  });

  it("fetches older messages once per window and rearms when more items arrive", () => {
    const { result, viewport, options, rerender } = setup({ hasNextPage: true });
    viewport.scrollOffset = 0;
    act(() => {
      result.current.handleScroll(0);
      result.current.handleScroll(0);
    });
    expect(options.fetchNextPage).toHaveBeenCalledTimes(1);
    rerender({ ...options, messages: [message("older", 1), ...options.messages] });
    act(() => result.current.handleScroll(0));
    expect(options.fetchNextPage).toHaveBeenCalledTimes(2);
  });

  it.each([{ isFetchingNextPage: true }, { isErrorNextPage: true }])(
    "does not auto-fetch older history while pending or failed: %j",
    (state) => {
      const { result, options } = setup({ hasNextPage: true, ...state });
      act(() => result.current.handleScroll(0));
      expect(options.fetchNextPage).not.toHaveBeenCalled();
    }
  );

  it("fetches newer history near the bottom once and keeps the return button visible", () => {
    const { result, options } = setup({ hasPreviousPage: true });
    act(() => {
      result.current.handleScroll(1500);
      result.current.handleScroll(1500);
    });
    expect(options.fetchPreviousPage).toHaveBeenCalledTimes(1);
    expect(result.current.showScrollButton).toBe(true);
  });

  it.each([{ isFetchingPreviousPage: true }, { isErrorPreviousPage: true }])(
    "does not fetch newer history while pending or failed: %j",
    (state) => {
      const { result, options } = setup({ hasPreviousPage: true, ...state });
      act(() => result.current.handleScroll(1500));
      expect(options.fetchPreviousPage).not.toHaveBeenCalled();
    }
  );

  it("shows a return button when away from the bottom and hides it near the latest message", () => {
    const { result } = setup();
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.handleScroll(500));
    expect(result.current.showScrollButton).toBe(true);
    act(() => result.current.handleScroll(1400));
    expect(result.current.showScrollButton).toBe(false);
  });

  it("sets a sticky message date only for scrollable content", () => {
    const { result, viewport } = setup();
    act(() => result.current.handleScroll(800));
    expect(result.current.activeStickyDate).not.toBeNull();
    viewport.scrollSize = 400;
    act(() => result.current.handleScroll(0));
    expect(result.current.activeStickyDate).toBeNull();
  });

  it("does not use a loader as a sticky date", () => {
    const { result, viewport } = setup({ hasNextPage: true });
    viewport.findItemIndex.mockReturnValue(0);
    act(() => result.current.handleScroll(0));
    expect(result.current.activeStickyDate).toBeNull();
  });

  it("centers and briefly highlights a locally available message", () => {
    const { result, viewport } = setup();
    viewport.scrollToIndex.mockClear();
    act(() => expect(result.current.scrollToMessage("m2")).toBe(true));
    expect(viewport.scrollToIndex).toHaveBeenLastCalledWith(2, { align: "center" });
    expect(result.current.highlightedMessageId).toBe("m2");
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.highlightedMessageId).toBeNull();
    act(() => expect(result.current.scrollToMessage("missing")).toBe(false));
  });

  it("handles missing virtualizer refs safely", () => {
    const { result, viewport } = setup();
    viewport.scrollToIndex.mockClear();
    result.current.virtualizerRef.current = null;
    act(() => {
      result.current.scrollToBottom();
      result.current.handleScroll(0);
      expect(result.current.scrollToMessage("m1")).toBe(false);
    });
    expect(viewport.scrollToIndex).not.toHaveBeenCalled();
  });

  it("centers a jump target once per timestamp and rearms a later jump", () => {
    const { result, viewport, options, rerender } = setup({
      isJumping: true,
      jumpTargetId: "m1",
      jumpTimestamp: 1,
    });
    expect(result.current.highlightedMessageId).toBe("m1");
    expect(viewport.scrollToIndex).toHaveBeenCalledWith(1, { align: "center" });
    viewport.scrollToIndex.mockClear();
    rerender({ ...options, messages: [...options.messages] });
    expect(viewport.scrollToIndex).not.toHaveBeenCalled();
    rerender({ ...options, jumpTimestamp: 2 });
    expect(viewport.scrollToIndex).toHaveBeenCalledWith(1, { align: "center" });
    act(() => vi.advanceTimersByTime(110));
    expect(result.current.isReadyToDisplay).toBe(true);
  });

  it("stops retrying an absent jump target after the bounded interval", () => {
    const { result, viewport } = setup({ isJumping: true, jumpTargetId: "missing" });
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.highlightedMessageId).toBeNull();
    expect(viewport.scrollToIndex).not.toHaveBeenCalled();
  });

  it("prevents an immediate top fetch after jumping until the user scrolls away", () => {
    const { result, options, rerender, viewport } = setup({
      hasNextPage: true,
      isJumping: true,
      jumpTargetId: "m1",
    });
    viewport.scrollOffset = 0;
    rerender({ ...options, isJumping: false });
    act(() => result.current.handleScroll(0));
    expect(options.fetchNextPage).not.toHaveBeenCalled();
    act(() => {
      result.current.handleScroll(300);
      result.current.handleScroll(0);
    });
    expect(options.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shifts prepended history except during a jump", () => {
    const { result, options, rerender } = setup({ isFetchingNextPage: true });
    expect(result.current.shifting).toBe(true);
    rerender({ ...options, isJumping: true });
    expect(result.current.shifting).toBe(false);
  });

  it("follows a viewport resize while locked to the latest message and removes listeners on unmount", () => {
    const { viewport, unmount } = setup();
    viewport.scrollTo.mockClear();
    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(2);
    });
    expect(viewport.scrollTo).toHaveBeenCalledWith(2000);
    unmount();
    viewport.scrollTo.mockClear();
    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(1000);
    });
    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });

  it("clears a pending highlight timer when centering another message", () => {
    const { result } = setup();
    act(() => {
      result.current.scrollToMessage("m2");
    });
    expect(result.current.highlightedMessageId).toBe("m2");
    act(() => {
      result.current.scrollToMessage("m1");
    });
    expect(result.current.highlightedMessageId).toBe("m1");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.highlightedMessageId).toBeNull();
  });

  it("evaluates bottom-follow from an older-history position", () => {
    const { result, options, rerender, viewport } = setup({ hasPreviousPage: true });
    act(() => result.current.handleScroll(1500));
    expect(options.fetchPreviousPage).toHaveBeenCalledTimes(1);
    viewport.scrollOffset = 1500;
    rerender({
      ...options,
      hasPreviousPage: true,
      messages: [
        ...options.messages,
        {
          id: "m3",
          sender_id: "u1",
          room_id: "r1",
          content: "new",
          created_at: "2026-03-30T10:02:00Z",
          type: "text",
        },
      ],
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.showScrollButton).toBe(true);
  });
});
