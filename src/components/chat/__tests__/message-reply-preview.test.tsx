import { ChatListItem, Message, User } from "@/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { MessageReplyPreview } from "../message-reply-preview";

describe("message reply previews", () => {
  afterEach(cleanup);
  function setup(
    reply = {},
    chat: Partial<ChatListItem> = {},
    current: User | null = { id: "u1", full_name: "Test Person" } as User,
    cachedName?: string
  ) {
    const context = createQueryWrapper();
    if (cachedName)
      context.client.setQueryData(["user", "u2"], { id: "u2", full_name: cachedName });
    const jumpToMessage = vi.fn();
    const parentClick = vi.fn();
    const message = {
      id: "m2",
      reply_to: {
        id: "m1",
        sender_id: "u2",
        sender_name: "Original Name",
        content: "Original message",
        created_at: "2026-01-02T00:00:00Z",
        ...reply,
      },
    } as Message;
    render(
      <div onClick={parentClick}>
        <MessageReplyPreview
          message={message}
          chat={chat as ChatListItem}
          current={current}
          isCurrentUser={true}
          jumpToMessage={jumpToMessage}
        />
      </div>,
      { wrapper: context.wrapper }
    );
    return { jumpToMessage, parentClick };
  }
  it("omits the preview when there is no reply", () => {
    const context = createQueryWrapper();
    const { container } = render(
      <MessageReplyPreview
        message={{ id: "m1" } as Message}
        chat={undefined}
        current={null}
        isCurrentUser={false}
        jumpToMessage={vi.fn()}
      />,
      { wrapper: context.wrapper }
    );
    expect(container).toBeEmptyDOMElement();
  });
  it("jumps to the original message with the current message as return origin and stops bubble selection", () => {
    const { jumpToMessage, parentClick } = setup();
    fireEvent.click(screen.getByText("Original message"));
    expect(jumpToMessage).toHaveBeenCalledWith("m1", "m2");
    expect(parentClick).not.toHaveBeenCalled();
  });
  it.each([
    ["2026-01-01T00:00:00Z", true],
    ["2026-01-02T00:00:00Z", false],
    ["2026-01-03T00:00:00Z", false],
  ])("only jumps to replies newer than the cleared-history boundary %s", (hidden_at, jumpable) => {
    const { jumpToMessage } = setup({}, { hidden_at });
    fireEvent.click(screen.getByText("Original message"));
    expect(jumpToMessage).toHaveBeenCalledTimes(jumpable ? 1 : 0);
  });
  it.each([{ id: "" }, { created_at: undefined }])(
    "does not jump to an unresolvable cleared-history reply (%j)",
    (reply) => {
      const { jumpToMessage } = setup(reply, { hidden_at: "2026-01-01T00:00:00Z" });
      fireEvent.click(screen.getByText("Original message"));
      expect(jumpToMessage).not.toHaveBeenCalled();
    }
  );
  it("uses You for a reply to the current user", () => {
    setup({ sender_id: "u1" });
    expect(screen.getByText("You")).toBeVisible();
    expect(screen.queryByText("Original Name")).not.toBeInTheDocument();
  });
  it("prefers an updated cached profile over the stale embedded sender name", () => {
    setup({}, {}, null, "Updated Name");
    expect(screen.getByText("Updated Name")).toBeVisible();
    expect(screen.queryByText("Original Name")).not.toBeInTheDocument();
  });
  it.each([
    [{ sender_id: null, sender_name: null }, "Deleted Account"],
    [{ sender_id: "u2", sender_name: null }, "Unknown User"],
    [{ sender_id: null, sender_name: "Legacy Sender" }, "Legacy Sender"],
  ])("handles missing or legacy sender identity (%j)", (reply, name) => {
    setup(reply, {}, null);
    expect(screen.getByText(name as string)).toBeVisible();
  });
  it("replaces deleted content without leaking the original text", () => {
    setup({ deleted_at: "2026-01-03T00:00:00Z" });
    expect(screen.getByText("Message deleted")).toBeVisible();
    expect(screen.queryByText("Original message")).not.toBeInTheDocument();
  });
  it("uses a file placeholder for a reply without a text caption", () => {
    setup({ content: "" });
    expect(screen.getByText("File")).toBeVisible();
  });
});
