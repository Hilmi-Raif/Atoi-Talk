import { act, cleanup, renderHook } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListScroll } from "../use-chat-list-scroll";

describe("chat-list scroll pagination", () => {
  afterEach(cleanup);
  function setup(
    overrides: Partial<Parameters<typeof useChatListScroll>[0]> = {},
    geometry = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 }
  ) {
    const viewport = { ...geometry, scrollTo: vi.fn() };
    const props = {
      hasNextPage: true,
      isFetchingNextPage: false,
      isError: false,
      fetchNextPage: vi.fn(),
      ...overrides,
    };
    const hook = renderHook(
      (current) => {
        const value = useChatListScroll(current);
        useLayoutEffect(() => {
          value.scrollRef.current = viewport as unknown as HTMLDivElement;
          return () => {
            value.scrollRef.current = null;
          };
        }, [value.scrollRef]);
        return value;
      },
      { initialProps: props }
    );
    const scroll = (top: number, height = viewport.scrollHeight) => {
      viewport.scrollTop = top;
      viewport.scrollHeight = height;
      act(() => hook.result.current.handleScroll({ currentTarget: viewport } as never));
    };
    const wheel = (deltaY: number) =>
      act(() => hook.result.current.handleWheel({ deltaY } as never));
    return { ...hook, viewport, props, scroll, wheel };
  }
  it("fetches once on bottom-zone entry and rearms only after scrolling away", () => {
    const { scroll, props } = setup();
    scroll(700);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    scroll(780);
    scroll(790);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
    scroll(600);
    scroll(780);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(2);
  });
  it.each([{ hasNextPage: false }, { isFetchingNextPage: true }])(
    "does not request another page when %j",
    (flags) => {
      const { scroll, props } = setup(flags);
      scroll(800);
      expect(props.fetchNextPage).not.toHaveBeenCalled();
    }
  );
  it("retries failed pagination on deliberate bottom scrolling but not a layout shift", () => {
    const { scroll, props } = setup({ isError: true });
    scroll(800);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
    scroll(1000, 1200);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(1);
    scroll(1000);
    expect(props.fetchNextPage).toHaveBeenCalledTimes(2);
  });
  it("keeps the error retry spinner in view when a bottom-zone retry starts", () => {
    const { scroll, props, rerender, viewport } = setup({ isError: true });
    scroll(800);
    rerender({ ...props, isFetchingNextPage: true, isError: false });
    expect(viewport.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
  });
  it.each([false, true])(
    "only autofills a short viewport after the first fetch (fetched=%s)",
    (isFetchedAfterMount) => {
      const { props } = setup(
        { isFetchedAfterMount },
        { scrollTop: 0, scrollHeight: 100, clientHeight: 200 }
      );
      expect(props.fetchNextPage).toHaveBeenCalledTimes(isFetchedAfterMount ? 1 : 0);
    }
  );
  it.each([{ hasNextPage: false }, { isError: true }, { isFetchingNextPage: true }])(
    "does not autofill a short viewport when %j",
    (flags) => {
      const { props } = setup(flags, { scrollTop: 0, scrollHeight: 100, clientHeight: 200 });
      expect(props.fetchNextPage).not.toHaveBeenCalled();
    }
  );
  it("retries a failed page only on downward wheel input at the bottom", () => {
    const { wheel, props, viewport } = setup({ isError: true });
    wheel(20);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    viewport.scrollTop = 800;
    wheel(-20);
    wheel(0);
    expect(props.fetchNextPage).not.toHaveBeenCalled();
    wheel(20);
    expect(props.fetchNextPage).toHaveBeenCalledOnce();
  });
  it.each([{ isError: false }, { isFetchingNextPage: true }, { hasNextPage: false }])(
    "does not wheel-retry when %j",
    (flags) => {
      const { wheel, props } = setup(
        { isError: true, ...flags },
        { scrollTop: 800, scrollHeight: 1000, clientHeight: 200 }
      );
      wheel(20);
      expect(props.fetchNextPage).not.toHaveBeenCalled();
    }
  );
});
