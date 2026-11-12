import type { ChatListItem, Message } from "@/types";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatMessages } from "../use-chat-room-messages";

const dependencies = vi.hoisted(() => ({
  messages: {} as Record<string, unknown>,
  jump: {} as Record<string, unknown>,
  viewport: {} as Record<string, unknown>,
  viewportInput: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/queries", () => ({
  useMessages: () => dependencies.messages,
  useJumpToMessage: () => dependencies.jump,
}));
vi.mock("@/hooks/chat-room/use-virtua-chat", () => ({
  useVirtuaChat: (input: Record<string, unknown>) => {
    dependencies.viewportInput = input;
    return dependencies.viewport;
  },
}));
vi.mock("@/lib/logger", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));
const props = {
  currentChatId: "c1",
  activeChatId: "c1",
  chat: { id: "c1" } as ChatListItem,
  isVirtual: false,
  chatError: null,
  isChatError: false,
  isLoadingSingleChat: false,
  isFetchingSingleChat: false,
};
function setup(overrides: Partial<Parameters<typeof useChatMessages>[0]> = {}) {
  return renderHook((input) => ({ ...useChatMessages(input), path: useLocation().pathname }), {
    initialProps: { ...props, ...overrides },
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/chat/c1"]}>{children}</MemoryRouter>
    ),
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  dependencies.messages = {
    data: { pages: [{ data: [] }] },
    fetchNextPage: vi.fn().mockResolvedValue({ isError: false }),
    fetchPreviousPage: vi.fn().mockResolvedValue({ isError: false }),
    hasNextPage: false,
    hasPreviousPage: false,
    isFetchingNextPage: false,
    isFetchingPreviousPage: false,
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
  };
  dependencies.jump = {
    jumpToMessage: vi.fn().mockResolvedValue(true),
    returnToLatest: vi.fn(),
    clearJumpState: vi.fn(),
    isJumped: false,
    jumpTargetId: null,
    jumpTimestamp: null,
  };
  dependencies.viewport = {
    virtualizerRef: { current: null },
    items: [],
    scrollToBottom: vi.fn(),
    activeStickyDate: null,
    handleScroll: vi.fn(),
    showScrollButton: false,
    shifting: false,
    isReadyToDisplay: true,
    highlightedMessageId: null,
    scrollToMessage: vi.fn().mockReturnValue(true),
  };
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useChatMessages orchestration", () => {
  it("flattens history pages, drops missing records and exposes loading state", () => {
    const first = { id: "m1", created_at: "2026-01-01T10:00:00Z" } as Message;
    const second = { id: "m2", created_at: "2026-01-02T10:00:00Z" } as Message;
    dependencies.messages.data = {
      pages: [{ data: [second, null] }, {}, { data: [first, first] }],
    };
    dependencies.messages.isRefetching = true;
    const { result } = setup();
    expect(result.current.messages).toEqual([second, first, first]);
    expect(result.current.isRefetching).toBe(true);
  });
  it.each([400, 403, 404])("redirects inaccessible message history (%s)", (status) => {
    dependencies.messages.isError = true;
    dependencies.messages.error = { response: { status } };
    const { result } = setup();
    expect(result.current.path).toBe("/");
  });
  it("does not redirect transient history failures", () => {
    dependencies.messages.isError = true;
    dependencies.messages.error = { response: { status: 503 } };
    const { result } = setup();
    expect(result.current.path).toBe("/chat/c1");
    expect(result.current.isMessagesError).toBe(true);
  });
  it.each([400, 404])("redirects missing chat details (%s)", (status) => {
    const { result } = setup({
      chat: null,
      chatError: { response: { status } },
      isChatError: true,
    });
    expect(result.current.path).toBe("/");
  });
  it("allows a brief detail-cache handoff before falling back to the chat list", async () => {
    const { result } = setup({ chat: null });
    expect(result.current.path).toBe("/chat/c1");
    await act(async () => vi.advanceTimersByTime(100));
    expect(result.current.path).toBe("/");
  });
  it.each([
    { isVirtual: true },
    { isLoadingSingleChat: true },
    { isFetchingSingleChat: true },
    { isChatError: true },
  ])(
    "does not redirect while details are unavailable for an expected reason (%j)",
    async (extra) => {
      const { result } = setup({ chat: null, ...extra });
      await act(async () => vi.advanceTimersByTime(200));
      expect(result.current.path).toBe("/chat/c1");
    }
  );
  it.each(["fetchNextPage", "fetchPreviousPage"] as const)(
    "exposes a retryable pagination error from %s",
    async (method) => {
      vi.mocked(dependencies.messages[method] as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ isError: true })
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({ isError: false });
      const { result } = setup();
      const run = () =>
        method === "fetchNextPage"
          ? result.current.handleFetchNextPage()
          : result.current.handleFetchPreviousPage();
      const errorKey = method === "fetchNextPage" ? "isErrorNextPage" : "isErrorPreviousPage";
      await act(async () => {
        await run();
      });
      expect(dependencies.viewportInput[errorKey]).toBe(true);
      await act(async () => {
        await run();
      });
      expect(dependencies.viewportInput[errorKey]).toBe(true);
      await act(async () => {
        await run();
      });
      expect(dependencies.viewportInput[errorKey]).toBe(false);
      expect(dependencies.messages[method]).toHaveBeenCalledTimes(3);
    }
  );
  it("shows historical sticky dates, hides Today and resets on chat change", () => {
    const { result, rerender } = setup();
    dependencies.viewport.activeStickyDate = "Yesterday";
    rerender(props);
    expect(result.current).toMatchObject({
      displayedStickyDate: "Yesterday",
      isStickyDateVisible: true,
    });
    dependencies.viewport.activeStickyDate = "Today";
    rerender(props);
    expect(result.current.isStickyDateVisible).toBe(false);
    rerender({ ...props, currentChatId: "c2", activeChatId: "c2" });
    expect(result.current.displayedStickyDate).toBeNull();
  });
  it("jumps locally and returns to the reply origin without requesting remote history", () => {
    const { result } = setup();
    act(() => result.current.handleJumpToMessage("target", "origin"));
    expect(result.current.returnStack).toEqual(["origin"]);
    expect(dependencies.jump.jumpToMessage).not.toHaveBeenCalled();
    act(() => result.current.handleReturnJump());
    expect(result.current.returnStack).toEqual([]);
    expect(dependencies.viewport.scrollToMessage).toHaveBeenLastCalledWith("origin");
    expect(dependencies.jump.clearJumpState).toHaveBeenCalled();
  });
  it("falls back to remote history when the target is outside the local window", async () => {
    vi.mocked(dependencies.viewport.scrollToMessage as ReturnType<typeof vi.fn>).mockReturnValue(
      false
    );
    const { result } = setup();
    await act(async () => result.current.handleJumpToMessage("remote"));
    expect(dependencies.jump.jumpToMessage).toHaveBeenCalledWith("remote");
    expect(result.current).toMatchObject({
      isRemoteJumping: false,
      jumpError: false,
      failedJumpTargetId: null,
    });
  });
  it.each([false, "throw"])(
    "records failed remote targets (%s) and clears errors on retry",
    async (outcome) => {
      const jump = vi.mocked(dependencies.jump.jumpToMessage as ReturnType<typeof vi.fn>);
      if (outcome === "throw") jump.mockRejectedValueOnce(new Error("offline"));
      else jump.mockResolvedValueOnce(false);
      const { result } = setup();
      await act(async () => {
        expect(await result.current.handleRemoteJump("missing")).toBe(false);
      });
      expect(result.current).toMatchObject({
        jumpError: true,
        failedJumpTargetId: "missing",
        isRemoteJumping: false,
      });
      await act(async () => {
        expect(await result.current.handleRemoteJump("found")).toBe(true);
      });
      expect(result.current).toMatchObject({ jumpError: false, failedJumpTargetId: null });
    }
  );
  it("keeps remote jumping busy until the history request completes", async () => {
    let finish!: (value: boolean) => void;
    vi.mocked(dependencies.jump.jumpToMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result } = setup();
    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.handleRemoteJump("remote");
    });
    expect(result.current.isRemoteJumping).toBe(true);
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(result.current.isRemoteJumping).toBe(false);
  });
  it("clears jump mode only after a remote return target is highlighted", async () => {
    const { result, rerender } = setup();
    act(() => result.current.handleJumpToMessage("target", "origin"));
    vi.mocked(dependencies.viewport.scrollToMessage as ReturnType<typeof vi.fn>).mockReturnValue(
      false
    );
    await act(async () => result.current.handleReturnJump());
    expect(dependencies.jump.clearJumpState).not.toHaveBeenCalled();
    dependencies.viewport.highlightedMessageId = "origin";
    rerender(props);
    expect(dependencies.jump.clearJumpState).toHaveBeenCalledTimes(1);
  });
  it("returns to latest history when there is no reply origin", () => {
    const { result } = setup();
    act(() => result.current.handleReturnJump());
    expect(dependencies.jump.returnToLatest).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])("returns to bottom with newer history present=%s", (hasPreviousPage) => {
    dependencies.messages.hasPreviousPage = hasPreviousPage;
    dependencies.jump.isJumped = true;
    const { result } = setup();
    act(() => result.current.handleScrollToBottom());
    if (hasPreviousPage) {
      expect(dependencies.jump.returnToLatest).toHaveBeenCalled();
      expect(dependencies.viewport.scrollToBottom).not.toHaveBeenCalled();
    } else {
      expect(dependencies.jump.clearJumpState).toHaveBeenCalled();
      expect(dependencies.viewport.scrollToBottom).toHaveBeenCalled();
    }
  });
  it("clears stale jump state after reaching latest history", async () => {
    dependencies.jump.isJumped = true;
    const { result } = setup();
    await act(async () => vi.advanceTimersByTime(1200));
    expect(dependencies.jump.clearJumpState).toHaveBeenCalledTimes(1);
    expect(result.current.path).toBe("/chat/c1");
  });
  it("clears the origin stack and restores latest history when switching chats", () => {
    dependencies.jump.isJumped = true;
    const { result, rerender } = setup();
    act(() => result.current.handleJumpToMessage("target", "origin"));
    rerender({ ...props, currentChatId: "c2", activeChatId: "c2" });
    expect(result.current.returnStack).toEqual([]);
    expect(dependencies.jump.returnToLatest).toHaveBeenCalledTimes(1);
  });
});
