import { useIsMobile } from "@/hooks/use-mobile";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalInnerWidth = window.innerWidth;

describe("useIsMobile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("switches the chat layout at 1024px in both resize directions", () => {
    const media = new EventTarget();
    vi.stubGlobal("matchMedia", () => media);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    const { result } = renderHook(() => useIsMobile(1024));
    expect(result.current).toBe(false);
    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
      media.dispatchEvent(new Event("change"));
    });
    expect(result.current).toBe(true);
    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
      media.dispatchEvent(new Event("change"));
    });
    expect(result.current).toBe(false);
  });

  it("updates on window resize even without a media-query change event", () => {
    vi.stubGlobal("matchMedia", () => new EventTarget());
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    const { result, unmount } = renderHook(() => useIsMobile(1024));
    expect(result.current).toBe(false);
    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(true);
    act(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toBe(false);
    unmount();
  });

  it("returns the mobile state on the first render", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    const seenValues: boolean[] = [];

    function Probe() {
      seenValues.push(useIsMobile());
      return null;
    }

    render(<Probe />);

    expect(seenValues[0]).toBe(true);
  });
});
