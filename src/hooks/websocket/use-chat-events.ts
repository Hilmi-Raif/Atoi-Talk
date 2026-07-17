import { errorLog } from "@/lib/logger";
import { getLatestReadReceiptTimestamp, getReadReceiptTimestamp } from "@/lib/read-receipts";
import { useChatStore } from "@/store";
import { ChatListItem, PaginatedResponse } from "@/types";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export const useChatEvents = (currentUser: { id: string } | null) => {
  const queryClient = useQueryClient();
  const removeDeletedChatId = useChatStore((state) => state.removeDeletedChatId);

  const handleChatNew = useCallback(
    (payload: ChatListItem) => {
      const newChat: ChatListItem = {
        id: payload.id,
        type: payload.type,
        name: payload.name,
        avatar: payload.avatar || null,
        unread_count: payload.unread_count || 0,
        is_pinned: payload.is_pinned || false,
        last_read_at: payload.last_read_at || null,
        other_last_read_at: payload.other_last_read_at || null,
        other_user_id: payload.other_user_id,
        is_blocked_by_me: payload.is_blocked_by_me,
        is_blocked_by_other: payload.is_blocked_by_other,
        last_message: payload.last_message || null,
        is_online: payload.is_online,
        my_role: payload.my_role,
        description: payload.description,
        is_public: payload.is_public,
        member_count: payload.member_count,
        invite_code: payload.invite_code,
        invite_expires_at: payload.invite_expires_at,
      };

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;

          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((c) => c.id !== payload.id),
          }));

          if (newPages.length > 0) {
            newPages[0] = {
              ...newPages[0],
              data: [newChat, ...newPages[0].data],
            };
          }
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueryData<ChatListItem>(["chat", payload.id], newChat);
    },
    [queryClient]
  );

  const handleChatUpdate = useCallback(
    (payload: ChatListItem) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat) => {
              if (chat.id === payload.id) {
                return {
                  ...chat,
                  ...payload,
                  name: payload.name || chat.name,
                  avatar: payload.avatar !== undefined ? payload.avatar : chat.avatar,
                  description:
                    payload.description !== undefined ? payload.description : chat.description,
                  invite_code:
                    payload.invite_code !== undefined ? payload.invite_code : chat.invite_code,
                  invite_expires_at:
                    payload.invite_expires_at !== undefined
                      ? payload.invite_expires_at
                      : chat.invite_expires_at,
                  member_count:
                    payload.member_count !== undefined ? payload.member_count : chat.member_count,
                  my_role: payload.my_role !== undefined ? payload.my_role : chat.my_role,
                  is_public: payload.is_public !== undefined ? payload.is_public : chat.is_public,

                  unread_count: chat.unread_count,
                  last_read_at: chat.last_read_at,
                  is_blocked_by_me: chat.is_blocked_by_me,
                  other_last_read_at: chat.other_last_read_at,
                };
              }
              return chat;
            }),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueryData<ChatListItem>(["chat", payload.id], (oldChat) => {
        if (oldChat) {
          const merged = { ...oldChat };

          if (payload.invite_code !== undefined) merged.invite_code = payload.invite_code;
          if (payload.invite_expires_at !== undefined)
            merged.invite_expires_at = payload.invite_expires_at;

          if (payload.name) merged.name = payload.name;
          if (payload.avatar !== undefined) merged.avatar = payload.avatar;
          if (payload.description !== undefined) merged.description = payload.description;
          if (payload.member_count !== undefined) merged.member_count = payload.member_count;
          if (payload.my_role !== undefined) merged.my_role = payload.my_role;
          if (payload.is_public !== undefined) merged.is_public = payload.is_public;

          return merged;
        }
        return oldChat;
      });
    },
    [queryClient]
  );

  const handleChatHide = useCallback(
    (payload: { chat_id: string }) => {
      const { chat_id } = payload;
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((chat: ChatListItem) => chat.id !== chat_id),
          }));
          return { ...oldData, pages: newPages };
        }
      );
    },
    [queryClient]
  );

  const handleChatDelete = useCallback(
    (data: { payload: unknown }) => {
      const payload = data.payload as { chat_id?: string; id?: string };
      const chatId =
        payload.chat_id ||
        payload.id ||
        ((data.payload as Record<string, unknown>)?.chat_id as string | undefined);

      if (!chatId) {
        errorLog("chat.delete: No chat_id found in payload", data);
        return;
      }

      const activeChatId = useChatStore.getState().activeChatId;
      const isActive = activeChatId === chatId;
      if (isActive) {
        window.dispatchEvent(new CustomEvent("kicked-from-chat", { detail: { chatId } }));
      }

      const chatsCache = queryClient.getQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>({
        queryKey: ["chats"],
      });
      let chatName = "a group";
      for (const [, cacheData] of chatsCache) {
        const found = cacheData?.pages.flatMap((p) => p.data).find((c) => c.id === chatId);
        if (found?.name) {
          const name = found.name;
          chatName = name.length > 20 ? name.slice(0, 20) + "..." : name;
          break;
        }
      }

      const recentlyDeleted = useChatStore.getState().recentlyDeletedChatIds;
      if (recentlyDeleted.has(chatId)) {
        removeDeletedChatId(chatId);
      } else {
        import("sonner").then(({ toast }) => {
          toast.error(`Removed from "${chatName}"`, {
            id: `chat-deleted-${chatId}`,
          });
        });
      }

      queryClient.cancelQueries({ queryKey: ["chat", chatId] });
      queryClient.cancelQueries({ queryKey: ["messages", chatId] });

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;

          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((chat) => chat.id !== chatId),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.removeQueries({ queryKey: ["chat", chatId] });
      queryClient.removeQueries({ queryKey: ["messages", chatId] });
      queryClient.removeQueries({ queryKey: ["group-members", "infinite", chatId] });

      queryClient.invalidateQueries({ queryKey: ["chats"], refetchType: "none" });
    },
    [queryClient, removeDeletedChatId]
  );

  const handleChatRead = useCallback(
    (
      payload: { chat_id: string; user_id: string },
      meta?: { timestamp?: number | string | null }
    ) => {
      if (payload.user_id !== currentUser?.id) {
        const readAt = getReadReceiptTimestamp(meta);

        queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
          { queryKey: ["chats"] },
          (oldData) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                data: page.data.map((chat) => {
                  if (chat.id === payload.chat_id) {
                    return {
                      ...chat,
                      other_last_read_at: getLatestReadReceiptTimestamp(
                        chat.other_last_read_at,
                        readAt
                      ),
                    };
                  }
                  return chat;
                }),
              })),
            };
          }
        );

        queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
          if (!oldChat) return oldChat;
          return {
            ...oldChat,
            other_last_read_at: getLatestReadReceiptTimestamp(oldChat.other_last_read_at, readAt),
          };
        });
      }
    },
    [currentUser, queryClient]
  );

  return { handleChatNew, handleChatUpdate, handleChatHide, handleChatDelete, handleChatRead };
};
