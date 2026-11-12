import { toast } from "@/lib/toast";
import chatService from "@/services/chat.service";
import { messageService } from "@/services/message.service";
import { userService } from "@/services/user.service";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useBlockUser, useUnblockUser } from "../use-block-user";
import { useEditMessage } from "../use-edit-message";
import { useHideChat } from "../use-hide-chat";
import { useMarkAsRead } from "../use-mark-read";

vi.mock("@/services/chat.service", () => {
  const service = { hideChat: vi.fn(), markAsRead: vi.fn() };
  return { default: service, chatService: service };
});
vi.mock("@/services/user.service", () => ({
  userService: { blockUser: vi.fn(), unblockUser: vi.fn(), getUserById: vi.fn() },
}));
vi.mock("@/services/message.service", () => ({ messageService: { editMessage: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

const message = { id: "m1", chat_id: "chat-1", content: "Original", attachments: [] };
const chat = {
  id: "chat-1",
  type: "private",
  other_user_id: "u2",
  unread_count: 4,
  is_online: true,
  last_message: message,
};
const other = { ...chat, id: "chat-2", other_user_id: "u3" };
const history = {
  pages: [{ data: [message, { ...message, id: "m2" }], meta: {} }],
  pageParams: [undefined],
};
const list = { pages: [{ data: [chat, other], meta: {} }], pageParams: [undefined] };

describe("chat actions reconcile real query caches", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    context.client.setQueryData(["chats", undefined], list);
    context.client.setQueryData(["chats", "search"], list);
    context.client.setQueryData(["chat", chat.id], chat);
    context.client.setQueryData(["messages", chat.id], history);
  });
  afterEach(() => context.client.clear());
  const chats = () => context.client.getQueryData<typeof list>(["chats", undefined])!.pages[0].data;

  it("clears unread counts in details and every list after read acknowledgement", async () => {
    vi.mocked(chatService.markAsRead).mockResolvedValue(undefined);
    const { result } = renderHook(useMarkAsRead, context);
    await act(() => result.current.mutateAsync(chat.id));
    expect(chats().map((item) => item.unread_count)).toEqual([0, 4]);
    expect(context.client.getQueryData(["chat", chat.id])).toMatchObject({ unread_count: 0 });
    expect(
      context.client.getQueryData<typeof list>(["chats", "search"])!.pages[0].data[0].unread_count
    ).toBe(0);
  });

  it("keeps unread counts when the read acknowledgement fails", async () => {
    vi.mocked(chatService.markAsRead).mockRejectedValue(new Error("Offline"));
    const { result } = renderHook(useMarkAsRead, context);
    await act(async () => {
      await expect(result.current.mutateAsync(chat.id)).rejects.toThrow("Offline");
    });
    expect(chats()[0].unread_count).toBe(4);
  });

  it("hides only the selected chat and removes its message cache", async () => {
    vi.mocked(chatService.hideChat).mockResolvedValue(undefined);
    const { result } = renderHook(useHideChat, context);
    await act(() => result.current.mutateAsync(chat.id));
    expect(chats()).toEqual([other]);
    expect(context.client.getQueryData(["messages", chat.id])).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith("Chat deleted successfully");
  });

  it.each([undefined, "Deletion denied"])(
    "keeps the sidebar and reports hide failure (%s)",
    async (error) => {
      vi.mocked(chatService.hideChat).mockRejectedValue({ response: { data: { error } } });
      const { result } = renderHook(useHideChat, context);
      await act(async () => {
        await expect(result.current.mutateAsync(chat.id)).rejects.toBeDefined();
      });
      expect(chats()).toEqual([chat, other]);
      expect(toast.error).toHaveBeenCalledWith(error || "Failed to delete chat");
    }
  );

  it("blocks the partner without changing unrelated conversations", async () => {
    context.client.setQueryData(["user", "u2"], { id: "u2", is_online: true });
    vi.mocked(userService.blockUser).mockResolvedValue(undefined);
    const { result } = renderHook(useBlockUser, context);
    await act(() => result.current.mutateAsync("u2"));
    expect(chats()[0]).toMatchObject({ is_blocked_by_me: true, is_online: false });
    expect(chats()[1]).toEqual(other);
    expect(context.client.getQueryData(["user", "u2"])).toMatchObject({
      is_blocked_by_me: true,
      is_online: false,
    });
    expect(context.client.getQueryState(["user", "u2"])?.isInvalidated).toBe(true);
  });

  it("unblocks using the fresh partner profile", async () => {
    const fresh = { id: "u2", is_online: true, is_blocked_by_me: false };
    vi.mocked(userService.unblockUser).mockResolvedValue(undefined);
    vi.mocked(userService.getUserById).mockResolvedValue(fresh as never);
    const { result } = renderHook(useUnblockUser, context);
    await act(() => result.current.mutateAsync("u2"));
    expect(chats()[0]).toMatchObject({ is_blocked_by_me: false, is_online: true });
    expect(chats()[1]).toEqual(other);
    expect(context.client.getQueryData(["user", "u2"])).toEqual(fresh);
  });

  it("removes the local block even if refreshing the partner fails", async () => {
    context.client.setQueryData(["user", "u2"], { id: "u2" });
    vi.mocked(userService.unblockUser).mockResolvedValue(undefined);
    vi.mocked(userService.getUserById).mockRejectedValue(new Error("Refresh failed"));
    const { result } = renderHook(useUnblockUser, context);
    await act(() => result.current.mutateAsync("u2"));
    expect(chats()[0]).toMatchObject({ is_blocked_by_me: false });
    expect(context.client.getQueryState(["user", "u2"])?.isInvalidated).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("User unblocked successfully");
  });

  it.each(["block", "unblock"])("leaves cached chats unchanged when %s fails", async (action) => {
    vi.mocked(
      action === "block" ? userService.blockUser : userService.unblockUser
    ).mockRejectedValue(new Error("Denied"));
    const { result } = renderHook(action === "block" ? useBlockUser : useUnblockUser, context);
    await act(async () => {
      await expect(result.current.mutateAsync("u2")).rejects.toThrow("Denied");
    });
    expect(chats()).toEqual([chat, other]);
    expect(toast.error).toHaveBeenCalledWith(`Failed to ${action} user`);
  });

  it("reconciles edited messages and the matching sidebar preview with the server response", async () => {
    const updated = { ...message, content: "Server edited", edited_at: "2026-11-11T10:00:00Z" };
    vi.mocked(messageService.editMessage).mockResolvedValue(updated as never);
    const { result } = renderHook(useEditMessage, context);
    await act(() =>
      result.current.mutateAsync({
        messageId: "m1",
        chatId: chat.id,
        data: { content: "Edited" },
        optimisticAttachments: [],
      })
    );
    expect(
      context.client.getQueryData<typeof history>(["messages", chat.id])!.pages[0].data
    ).toEqual([updated, { ...message, id: "m2" }]);
    expect(chats()[0].last_message).toEqual(updated);
    expect(chats()[1]).toEqual(other);
  });

  it.each([undefined, "Edit denied"])(
    "rolls back every history cache on edit failure (%s)",
    async (error) => {
      context.client.setQueryData(["messages", chat.id, "around"], history);
      vi.mocked(messageService.editMessage).mockRejectedValue({ response: { data: { error } } });
      const { result } = renderHook(useEditMessage, context);
      await act(async () => {
        await expect(
          result.current.mutateAsync({
            messageId: "m1",
            chatId: chat.id,
            data: { content: "Edited" },
            optimisticAttachments: [],
          })
        ).rejects.toBeDefined();
      });
      expect(context.client.getQueryData(["messages", chat.id])).toEqual(history);
      expect(context.client.getQueryData(["messages", chat.id, "around"])).toEqual(history);
      expect(chats()).toEqual([chat, other]);
      expect(toast.error).toHaveBeenCalledWith(error || "Failed to edit message");
    }
  );
});
