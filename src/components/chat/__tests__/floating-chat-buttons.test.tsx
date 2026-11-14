import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingChatButtons } from "../floating-chat-buttons";

const setupScroller = () => {
  const scrollEl = document.createElement("div");
  scrollEl.className = "chat-message-list";
  scrollEl.style.overflowY = "auto";
  document.body.appendChild(scrollEl);
  return scrollEl;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const stubPointerCoarse = (matches = true) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("coarse") ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
};

describe("FloatingChatButtons", () => {
  beforeEach(() => {
    stubPointerCoarse(true);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("holds hidden overflow across two frames, then restores it", async () => {
    const scrollEl = setupScroller();

    render(<FloatingChatButtons showScrollButton scrollToBottom={() => {}} />);
    fireEvent.pointerDown(screen.getByRole("button"));

    // hidden right away so the compositor sees it
    expect(scrollEl.style.overflowY).toBe("hidden");

    // stay hidden after one frame because android needs two frames
    await nextFrame();
    expect(scrollEl.style.overflowY).toBe("hidden");

    await nextFrame();
    expect(scrollEl.style.overflowY).toBe("auto");
  });

  it("runs the click action only after the fling stop completes", async () => {
    setupScroller();
    const scrollToBottom = vi.fn();

    render(<FloatingChatButtons showScrollButton scrollToBottom={scrollToBottom} />);
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    fireEvent.click(button);

    expect(scrollToBottom).not.toHaveBeenCalled();
    await nextFrame();
    expect(scrollToBottom).not.toHaveBeenCalled();
    await nextFrame();
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("does not change desktop overflow when either floating button is clicked", async () => {
    stubPointerCoarse(false);
    const scrollEl = setupScroller();
    const setProperty = vi.spyOn(scrollEl.style, "setProperty");
    const scrollToBottom = vi.fn();
    const onReturnJump = vi.fn();
    render(
      <FloatingChatButtons
        showScrollButton
        showReturnButton
        onReturnJump={onReturnJump}
        scrollToBottom={scrollToBottom}
      />
    );
    for (const button of screen.getAllByRole("button")) {
      fireEvent.pointerDown(button);
      fireEvent.click(button);
    }
    await Promise.resolve();
    expect(scrollEl.style.overflowY).toBe("auto");
    expect(setProperty).not.toHaveBeenCalled();
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
    expect(onReturnJump).toHaveBeenCalledTimes(1);
  });

  it("still fires the click action when the chat scroller is absent", async () => {
    const scrollToBottom = vi.fn();

    render(<FloatingChatButtons showScrollButton scrollToBottom={scrollToBottom} />);
    const button = screen.getByRole("button");
    expect(() => fireEvent.pointerDown(button)).not.toThrow();
    fireEvent.click(button);
    await nextFrame();
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("reuses an in-flight stop instead of restarting it", async () => {
    const scrollEl = setupScroller();
    const setProperty = vi.spyOn(scrollEl.style, "setProperty");

    render(<FloatingChatButtons showScrollButton scrollToBottom={() => {}} />);
    const button = screen.getByRole("button");
    fireEvent.pointerDown(button);
    fireEvent.pointerDown(button);

    const hiddenCalls = setProperty.mock.calls.filter(
      (args) => args[0] === "overflow-y" && args[1] === "hidden"
    );
    expect(hiddenCalls).toHaveLength(1);
    await nextFrame();
    await nextFrame();
    expect(scrollEl.style.overflowY).toBe("auto");
  });
});
