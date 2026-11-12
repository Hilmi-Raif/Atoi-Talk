import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { ChatMessageList } from "../chat-message-list";

vi.mock("virtua", () => ({
  VList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
type Props = ComponentProps<typeof ChatMessageList>;
describe("message list rendering and recovery", () => {
  const clients: ReturnType<typeof createQueryWrapper>[] = [];
  afterEach(() => {
    cleanup();
    clients.splice(0).forEach(({ client }) => client.clear());
  });
  function setup(overrides: Partial<Props> = {}) {
    const context = createQueryWrapper();
    clients.push(context);
    const props = {
      chat: { id: "chat-1", type: "private", name: "Ada" },
      currentUser: null,
      items: [],
      messageRefs: { current: {} },
      virtualizerRef: { current: null },
      textareaRef: { current: null },
      isReadyToDisplay: true,
      handleRemoteJump: vi.fn(),
      refetchMessages: vi.fn(),
      handleFetchNextPage: vi.fn(),
      handleFetchPreviousPage: vi.fn(),
      handleJumpToMessage: vi.fn(),
      handleClick: vi.fn(),
      ...overrides,
    } as unknown as Props;
    return { ...render(<ChatMessageList {...props} />, { wrapper: context.wrapper }), props };
  }
  it.each([
    { isMessagesError: true },
    { jumpError: true, failedJumpTargetId: "failed", jumpTargetId: "requested" },
    { jumpError: true, jumpTargetId: "requested" },
    { jumpError: true },
    { jumpError: true, isMessagesError: true },
  ])("routes recovery to the appropriate history request for %j", (flags) => {
    const { props } = setup(flags);
    expect(
      screen.getByRole("heading", {
        name:
          flags.jumpError && !flags.isMessagesError
            ? "Failed to load message"
            : "Failed to load messages",
      })
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    const target =
      "failedJumpTargetId" in flags
        ? flags.failedJumpTargetId
        : "jumpTargetId" in flags
          ? flags.jumpTargetId
          : undefined;
    if (target) {
      expect(props.handleRemoteJump).toHaveBeenCalledWith(target);
      expect(props.refetchMessages).not.toHaveBeenCalled();
    } else {
      expect(props.refetchMessages).toHaveBeenCalledOnce();
      expect(props.handleRemoteJump).not.toHaveBeenCalled();
    }
  });
  it("keeps cached messages visible during a background history failure", () => {
    setup({
      isMessagesError: true,
      items: [{ id: "date", type: "date-separator", date: "Yesterday" }],
    });
    expect(screen.getByText("Yesterday")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
  it("renders both pagination spinners and independently retries older and newer pages", () => {
    const { container, props } = setup({
      items: [
        { id: "loader-top", type: "loader" },
        { id: "loader-bottom", type: "loader" },
        { id: "error-top", type: "error", direction: "up" },
        { id: "error-bottom", type: "error", direction: "down" },
      ] as Props["items"],
    });
    expect(screen.getAllByRole("status")).toHaveLength(2);
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    expect(props.handleFetchNextPage).toHaveBeenCalledOnce();
    expect(props.handleFetchPreviousPage).toHaveBeenCalledOnce();
  });
  it("renders system notifications and registers their message elements", () => {
    const { props } = setup({
      items: [
        {
          id: "system",
          type: "message",
          message: { id: "system", type: "system_unknown", content: "Room archived" },
        },
      ] as Props["items"],
    });
    expect(screen.getByText("Room archived")).toBeVisible();
    expect(props.messageRefs.current.system).toBeInstanceOf(HTMLDivElement);
  });
  it("renders ordinary messages and forwards reply jumps with the origin message", () => {
    const { props } = setup({
      items: [
        {
          id: "m1",
          type: "message",
          message: {
            id: "m1",
            type: "text",
            content: "A response",
            sender_id: "u2",
            sender_name: "Ada",
            created_at: new Date().toISOString(),
            reply_to: {
              id: "original",
              content: "Original question",
              sender_id: "u3",
              sender_name: "Bob",
              type: "text",
            },
          },
        },
      ] as Props["items"],
    });
    expect(screen.getByText("A response")).toBeVisible();
    fireEvent.click(screen.getByText("Original question"));
    expect(props.handleJumpToMessage).toHaveBeenCalledWith("original", "m1");
  });
});
