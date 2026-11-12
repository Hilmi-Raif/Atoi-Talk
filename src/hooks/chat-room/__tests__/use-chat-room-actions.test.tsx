import { chatService, messageService } from "@/services";
import { messageService as editService } from "@/services/message.service";
import { useChatStore } from "@/store";
import type { Media, Message } from "@/types";
import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useChatActions } from "../use-chat-room-actions";

vi.mock("@/services", () => ({
  messageService: { sendMessage: vi.fn(), deleteMessage: vi.fn() },
  chatService: { createPrivateChat: vi.fn(), getChatById: vi.fn() },
}));
vi.mock("@/services/message.service", () => ({ messageService: { editMessage: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));

const message: Message = {
  id: "m1",
  chat_id: "c1",
  sender_id: "u1",
  content: "Original",
  type: "text",
  created_at: new Date().toISOString(),
  attachments: [],
};
const media = (mime_type = "image/png") => ({ id: "media-1", mime_type }) as Media;

describe("chat room composer actions with real mutation hooks", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  let scroll: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    scroll = vi.fn();
    useChatStore.getState().reset();
    context.client.setQueryData(["messages", "c1"], {
      pages: [{ data: [message], meta: {} }],
      pageParams: [undefined],
    });
    vi.mocked(messageService.sendMessage).mockResolvedValue({ ...message, id: "sent" });
    vi.mocked(messageService.deleteMessage).mockResolvedValue(undefined);
  });
  afterEach(() => {
    context.client.clear();
    vi.useRealTimers();
  });

  function setup(overrides = {}) {
    const QueryWrapper = context.wrapper;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/chat/c1"]}>
        <QueryWrapper>{children}</QueryWrapper>
      </MemoryRouter>
    );
    return renderHook(
      (props) => ({
        ...useChatActions({
          currentChatId: "c1",
          isVirtual: false,
          targetUserId: null,
          messages: [message],
          scrollToBottom: scroll,
          ...props,
        }),
        location: useLocation(),
      }),
      { wrapper, initialProps: overrides }
    );
  }

  it("ignores empty content and chats that have no target", async () => {
    const { result, rerender } = setup({ currentChatId: null });
    await act(() => result.current.handleSendMessage("Hello", []));
    rerender({ currentChatId: "c1" });
    await act(() => result.current.handleSendMessage("   ", []));
    expect(messageService.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", "image"],
    ["video/mp4", "video"],
    ["audio/mpeg", "audio"],
    ["application/pdf", "file"],
  ])("sends an attachment-only %s message", async (mime, type) => {
    const { result } = setup();
    await act(() => result.current.handleSendMessage(" ", [media(mime)]));
    await waitFor(() => expect(scroll).toHaveBeenCalledOnce());
    expect(messageService.sendMessage).toHaveBeenCalledWith({
      chat_id: "c1",
      content: "",
      type,
      attachment_ids: ["media-1"],
      reply_to_id: undefined,
    });
  });

  it("sends a trimmed caption and reply then clears the composer on success", async () => {
    const { result } = setup();
    act(() => {
      result.current.setReplyTo(message);
      result.current.setNewMessageText("  Caption  ");
      result.current.setAttachments([media()]);
      result.current.setAttachmentMode(true);
    });
    await act(() => result.current.handleSendMessage("  Caption  ", [media()]));
    await waitFor(() => expect(result.current.newMessageText).toBe(""));
    expect(messageService.sendMessage).toHaveBeenCalledWith({
      chat_id: "c1",
      content: "Caption",
      type: "text",
      reply_to_id: "m1",
      attachment_ids: ["media-1"],
    });
    expect(result.current.replyTo).toBeNull();
    expect(result.current.attachments).toEqual([]);
    expect(result.current.attachmentMode).toBe(false);
    expect(scroll).toHaveBeenCalledOnce();
  });

  it("preserves text, reply and attachments after a rejected send", async () => {
    vi.mocked(messageService.sendMessage).mockRejectedValue(new Error("Offline"));
    const { result } = setup();
    act(() => {
      result.current.setNewMessageText("Draft");
      result.current.setReplyTo(message);
      result.current.setAttachments([media()]);
    });
    await act(() => result.current.handleSendMessage("Draft", [media()]));
    await waitFor(() => expect(result.current.isSending).toBe(false));
    expect(result.current.newMessageText).toBe("Draft");
    expect(result.current.replyTo?.id).toBe("m1");
    expect(result.current.attachments).toEqual([media()]);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("updates a reply after a live edit and removes it after deletion", () => {
    const { result, rerender } = setup({ messages: [message] });
    act(() => result.current.setReplyTo(message));
    rerender({ messages: [{ ...message, content: "Changed", edited_at: "now" }] });
    expect(result.current.replyTo?.content).toBe("Changed");
    rerender({ messages: [{ ...message, deleted_at: "now" }] });
    expect(result.current.replyTo).toBeNull();
  });

  it("clears chat-specific draft, selection, edit and attachments when switching chats", () => {
    const { result, rerender } = setup({ currentChatId: "c1" });
    act(() => {
      result.current.setNewMessageText("Draft");
      result.current.setReplyTo(message);
      result.current.setEditMessage(message);
      result.current.setAttachments([media()]);
      result.current.setActiveMessageId("m1");
      result.current.setShowDeleteModal(true);
    });
    rerender({ currentChatId: "c2" });
    expect(result.current.newMessageText).toBe("");
    expect(result.current.replyTo).toBeNull();
    expect(result.current.editMessage).toBeNull();
    expect(result.current.attachments).toEqual([]);
    expect(result.current.activeMessageId).toBeNull();
    expect(result.current.showDeleteModal).toBe(false);
  });

  it("toggles a message menu and dismisses only clicks outside messages", () => {
    const { result } = setup();
    act(() => result.current.handleClick("m1"));
    const element = document.createElement("div");
    element.id = "message-m1";
    document.body.append(element);
    fireEvent.mouseDown(element);
    expect(result.current.activeMessageId).toBe("m1");
    act(() => result.current.handleClick("m1"));
    expect(result.current.activeMessageId).toBeNull();
    act(() => {
      result.current.handleClick("m1");
      result.current.setShowDeleteModal(true);
    });
    fireEvent.mouseDown(document.body);
    expect(result.current.activeMessageId).toBe("m1");
    act(() => result.current.setShowDeleteModal(false));
    fireEvent.mouseDown(document.body);
    expect(result.current.activeMessageId).toBeNull();
    element.remove();
  });

  it("closes delete confirmation and tombstones the message after acknowledgement", async () => {
    const { result } = setup();
    act(() => {
      result.current.setShowDeleteModal(true);
      result.current.setMessageToDelete("m1");
    });
    act(() => result.current.handleDeleteMessage("m1"));
    await waitFor(() => expect(result.current.showDeleteModal).toBe(false));
    expect(result.current.messageToDelete).toBeNull();
    expect(result.current.isDeleteSubmitting).toBe(false);
    expect(context.client.getQueryData(["messages", "c1"])).toMatchObject({
      pages: [{ data: [{ id: "m1", deleted_at: expect.any(String) }] }],
    });
  });

  it("retains the delete confirmation and original message after rejection", async () => {
    vi.mocked(messageService.deleteMessage).mockRejectedValue(new Error("Denied"));
    const { result } = setup();
    act(() => {
      result.current.setShowDeleteModal(true);
      result.current.setMessageToDelete("m1");
    });
    act(() => result.current.handleDeleteMessage("m1"));
    await waitFor(() => expect(result.current.isDeleteSubmitting).toBe(false));
    expect(result.current.showDeleteModal).toBe(true);
    expect(result.current.messageToDelete).toBe("m1");
    expect(context.client.getQueryData(["messages", "c1"])).toMatchObject({
      pages: [{ data: [{ content: "Original" }] }],
    });
  });

  it("does not delete without a selected chat", () => {
    const { result } = setup({ currentChatId: null });
    act(() => result.current.handleDeleteMessage("m1"));
    expect(messageService.deleteMessage).not.toHaveBeenCalled();
    expect(result.current.isDeleteSubmitting).toBe(false);
  });

  it("creates a virtual private chat before sending and replaces the route", async () => {
    vi.mocked(chatService.createPrivateChat).mockResolvedValue({ id: "new-chat" } as never);
    vi.mocked(chatService.getChatById).mockResolvedValue({
      id: "new-chat",
      last_message: null,
    } as never);
    const { result } = setup({ currentChatId: null, isVirtual: true, targetUserId: "u2" });
    act(() => result.current.setNewMessageText("First message"));
    await act(() => result.current.handleSendMessage("First message", []));
    await waitFor(() => expect(result.current.location.pathname).toBe("/chat/new-chat"));
    expect(chatService.createPrivateChat).toHaveBeenCalledWith({ target_user_id: "u2" });
    expect(messageService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chat_id: "new-chat" })
    );
    expect(result.current.newMessageText).toBe("");
    expect(useChatStore.getState().activeChatId).toBe("new-chat");
  });

  it("retains a created chat for retry instead of creating a second conversation", async () => {
    vi.mocked(chatService.createPrivateChat).mockResolvedValue({ id: "new-chat" } as never);
    vi.mocked(chatService.getChatById).mockResolvedValue({
      id: "new-chat",
      last_message: null,
    } as never);
    vi.mocked(messageService.sendMessage)
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ ...message, id: "sent", chat_id: "new-chat" });
    const { result } = setup({ currentChatId: null, isVirtual: true, targetUserId: "u2" });
    act(() => result.current.setNewMessageText("Retry me"));
    await act(() => result.current.handleSendMessage("Retry me", []));
    await waitFor(() => expect(messageService.sendMessage).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.isSending).toBe(false));
    expect(result.current.newMessageText).toBe("Retry me");
    expect(result.current.location.pathname).toBe("/chat/c1");
    await act(() => result.current.handleSendMessage("Retry me", []));
    await waitFor(() => expect(result.current.location.pathname).toBe("/chat/new-chat"));
    expect(chatService.createPrivateChat).toHaveBeenCalledOnce();
    expect(messageService.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not send when private chat creation fails", async () => {
    vi.mocked(chatService.createPrivateChat).mockRejectedValue(new Error("Denied"));
    const { result } = setup({ currentChatId: null, isVirtual: true, targetUserId: "u2" });
    act(() => result.current.setNewMessageText("Keep me"));
    await act(() => result.current.handleSendMessage("Keep me", []));
    await waitFor(() => expect(chatService.createPrivateChat).toHaveBeenCalledOnce());
    expect(messageService.sendMessage).not.toHaveBeenCalled();
    expect(result.current.newMessageText).toBe("Keep me");
  });

  it("cancels an unchanged edit without submitting to the API", async () => {
    const { result } = setup();
    act(() => {
      result.current.setEditMessage(message);
      result.current.setNewMessageText("Original");
    });
    await act(() => result.current.handleEditMessage(" Original ", []));
    expect(editService.editMessage).not.toHaveBeenCalled();
    expect(result.current.editMessage).toBeNull();
    expect(result.current.newMessageText).toBe("");
  });

  it("ignores empty edits and edits without a selected message", async () => {
    const { result } = setup();
    await act(() => result.current.handleEditMessage("Changed", []));
    act(() => result.current.setEditMessage(message));
    await act(() => result.current.handleEditMessage("  ", []));
    expect(editService.editMessage).not.toHaveBeenCalled();
    expect(result.current.editMessage?.id).toBe("m1");
  });

  it("saves an edited caption and clears edit state after server acknowledgement", async () => {
    vi.mocked(editService.editMessage).mockResolvedValue({
      ...message,
      content: "Changed",
      attachments: [media()],
    });
    const { result } = setup();
    act(() => {
      result.current.setEditMessage(message);
      result.current.setNewMessageText(" Changed ");
      result.current.setAttachments([media()]);
      result.current.setAttachmentMode(true);
    });
    await act(() => result.current.handleEditMessage(" Changed ", [media()]));
    expect(editService.editMessage).toHaveBeenCalledWith("m1", {
      content: "Changed",
      attachment_ids: ["media-1"],
    });
    expect(result.current.editMessage).toBeNull();
    expect(result.current.newMessageText).toBe("");
    expect(result.current.attachments).toEqual([]);
    expect(result.current.attachmentMode).toBe(false);
  });

  it("keeps an edit draft and rolls back the cache when saving fails", async () => {
    vi.mocked(editService.editMessage).mockRejectedValue(new Error("Offline"));
    const { result } = setup();
    act(() => {
      result.current.setEditMessage(message);
      result.current.setNewMessageText("Changed");
    });
    await act(() => result.current.handleEditMessage("Changed", []));
    expect(result.current.editMessage?.id).toBe("m1");
    expect(result.current.newMessageText).toBe("Changed");
    expect(context.client.getQueryData(["messages", "c1"])).toMatchObject({
      pages: [{ data: [{ content: "Original" }] }],
    });
  });

  it("rejects an already expired edit and expires an open edit at its deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T10:00:00Z"));
    const { result } = setup();
    act(() => result.current.setEditMessage({ ...message, created_at: "2026-11-11T09:00:00Z" }));
    expect(result.current.editMessage).toBeNull();
    act(() => {
      result.current.setEditMessage({ ...message, created_at: "2026-11-11T10:00:00Z" });
      result.current.setAttachments([media()]);
    });
    act(() => vi.advanceTimersByTime(15 * 60 * 1000 - 10 * 1000));
    expect(result.current.editMessage).toBeNull();
    expect(result.current.attachments).toEqual([]);
  });
});
