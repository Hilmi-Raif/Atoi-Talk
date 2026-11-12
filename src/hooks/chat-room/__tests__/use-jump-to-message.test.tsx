import { toast } from "@/lib/toast";
import { act, renderHook } from "@testing-library/react";
import { VListHandle } from "virtua";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJumpToMessage } from "../use-jump-to-message";
import { ChatItem } from "../use-virtua-chat";

vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn() } }));
describe("jumping to a loaded message", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  const items = [
    { type: "date", id: "date-1", date: "Today" },
    { type: "message", message: { id: "m1" } },
    { type: "message", message: { id: "m2" } },
  ] as ChatItem[];
  function setup(options: { missingViewport?: boolean; remote?: (id: string) => void } = {}) {
    const scrollToIndex = vi.fn();
    const virtualizerRef = {
      current: options.missingViewport ? null : ({ scrollToIndex } as unknown as VListHandle),
    };
    return {
      ...renderHook(() =>
        useJumpToMessage({ items, virtualizerRef, onRemoteJump: options.remote })
      ),
      scrollToIndex,
    };
  }
  it("centers a message and highlights it for two seconds", () => {
    const { result, scrollToIndex } = setup();
    act(() => {
      expect(result.current.jumpToMessage("m1")).toBe(true);
    });
    expect(scrollToIndex).toHaveBeenCalledWith(1, { align: "center" });
    expect(result.current.highlightedMessageId).toBe("m1");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.highlightedMessageId).toBeNull();
  });
  it("restarts the highlight deadline for a subsequent jump", () => {
    const { result } = setup();
    act(() => {
      result.current.jumpToMessage("m1");
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      result.current.jumpToMessage("m2");
      vi.advanceTimersByTime(500);
    });
    expect(result.current.highlightedMessageId).toBe("m2");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.highlightedMessageId).toBeNull();
  });
  it("can center a non-message list item by its own ID", () => {
    const { result, scrollToIndex } = setup();
    act(() => {
      result.current.jumpToMessage("date-1");
    });
    expect(scrollToIndex).toHaveBeenCalledWith(0, { align: "center" });
  });
  it.each([true, false])(
    "delegates to remote loading when local navigation is unavailable (no viewport=%s)",
    (missingViewport) => {
      const remote = vi.fn();
      const { result, scrollToIndex } = setup({ missingViewport, remote });
      act(() => {
        expect(result.current.jumpToMessage(missingViewport ? "m1" : "missing")).toBe(false);
      });
      expect(remote).toHaveBeenCalledWith(missingViewport ? "m1" : "missing");
      expect(scrollToIndex).not.toHaveBeenCalled();
      expect(result.current.highlightedMessageId).toBeNull();
      expect(toast.info).not.toHaveBeenCalled();
    }
  );
  it("explains an unavailable message when remote loading is not configured", () => {
    const { result } = setup();
    act(() => {
      expect(result.current.jumpToMessage("missing")).toBe(false);
    });
    expect(toast.info).toHaveBeenCalledWith("Message not found within loaded items.");
  });
  it("cancels a pending highlight timeout on unmount", () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.jumpToMessage("m1");
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
