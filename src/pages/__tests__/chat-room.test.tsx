import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import ChatRoom from "../chat-room";

const state = vi.hoisted(() => ({
  room: {} as Record<string, unknown>,
  footer: {} as Record<string, unknown>,
  list: {} as Record<string, unknown>,
  deletion: {} as Record<string, unknown>,
  header: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/chat-room/use-chat-room", () => ({ useChatRoom: () => state.room }));
vi.mock("@/components/ui/sidebar.tsx", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/chat/chat-footer", () => ({
  default: (props: Record<string, unknown>) => {
    state.footer = props;
    return <div>Composer boundary</div>;
  },
}));
vi.mock("@/components/chat/chat-message-list", () => ({
  ChatMessageList: (props: Record<string, unknown>) => {
    state.list = props;
    return <div>History boundary</div>;
  },
}));
vi.mock("@/components/chat/chat-room-header", () => ({
  ChatRoomHeader: (props: Record<string, unknown>) => {
    state.header = props;
    return <header>Header boundary</header>;
  },
}));
vi.mock("@/components/chat/system-message", () => ({
  SystemMessageBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/modals/delete-message-dialog.tsx", () => ({
  DeleteMessageDialog: (props: Record<string, unknown>) => {
    state.deletion = props;
    return null;
  },
}));

beforeEach(() => {
  state.room = {
    returnStack: [],
    handleEditMessage: vi.fn(),
    handleDeleteMessage: vi.fn(),
    handleSendMessage: vi.fn(),
    handleReturnJump: vi.fn(),
    handleScrollToBottom: vi.fn(),
  };
});

it("normalizes absent chat and selection state at component boundaries", () => {
  render(<ChatRoom />);
  expect(state.header).toMatchObject({ chat: null, partnerId: null });
  expect(state.list).toMatchObject({
    chat: null,
    activeMessageId: null,
    highlightedMessageId: null,
  });
  expect(state.footer.chat).toBeUndefined();
  expect(state.footer.showReturnButton).toBe(false);
});

it("preserves loaded identity, selected messages and return navigation", () => {
  const chat = { id: "c1" };
  state.room = {
    ...state.room,
    chat,
    partnerId: "u2",
    activeMessageId: "m1",
    highlightedMessageId: "m2",
    returnStack: ["origin"],
    isStickyDateVisible: true,
    displayedStickyDate: "Yesterday",
  };
  render(<ChatRoom />);
  expect(state.header).toMatchObject({ chat, partnerId: "u2" });
  expect(state.list).toMatchObject({ chat, activeMessageId: "m1", highlightedMessageId: "m2" });
  expect(state.footer).toMatchObject({
    chat,
    showReturnButton: true,
    onReturnJump: state.room.handleReturnJump,
    scrollToBottom: state.room.handleScrollToBottom,
  });
  expect(screen.getByText("Yesterday")).toBeVisible();
});

it.each([
  { isStickyDateVisible: false, displayedStickyDate: "Yesterday" },
  { isStickyDateVisible: true, displayedStickyDate: "" },
])("does not render an incomplete sticky date for %j", (flags) => {
  Object.assign(state.room, flags);
  render(<ChatRoom />);
  expect(screen.queryByText("Yesterday")).not.toBeInTheDocument();
});

it.each([
  { data: {}, optimisticAttachments: undefined },
  { data: { content: "Edited" }, optimisticAttachments: [{ id: "a1" }] },
])("adapts composer edits without dropping content or attachments for %j", (params) => {
  render(<ChatRoom />);
  act(() => (state.footer.onEditMessage as (p: typeof params) => void)(params));
  expect(state.room.handleEditMessage).toHaveBeenCalledWith(
    params.data.content || "",
    params.optimisticAttachments || []
  );
});

it.each([null, "m1"])("only deletes a selected message (%s)", (messageToDelete) => {
  state.room.messageToDelete = messageToDelete;
  render(<ChatRoom />);
  act(() => (state.deletion.onConfirmDelete as () => void)());
  if (messageToDelete) expect(state.room.handleDeleteMessage).toHaveBeenCalledWith("m1");
  else expect(state.room.handleDeleteMessage).not.toHaveBeenCalled();
});
