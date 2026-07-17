import { getLatestReadReceiptTimestamp, getReadReceiptTimestamp } from "@/lib/read-receipts";
import { useChatStore } from "@/store";
import { ChatListItem, GroupMember, Message, PaginatedResponse } from "@/types";
import { InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

export const useMessageEvents = (
  currentUser: { id: string } | null,
  clearTypingTimeout: (key: string) => void,
  setUserTyping: (chatId: string, userId: string, isTyping: boolean) => void
) => {
  const queryClient = useQueryClient();
  const memberInvalidationTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const handleMessageNew = useCallback(
    (payload: Message) => {
      const { isJumped: isCurrentlyJumped, activeChatId: currentActiveChatId } =
        useChatStore.getState();
      const isJumpedChat = isCurrentlyJumped && payload.chat_id === currentActiveChatId;

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<Message>>>(
        { queryKey: ["messages", payload.chat_id], exact: true },
        (oldData) => {
          if (!oldData) return oldData;
          if (isJumpedChat) return oldData;

          const newPages = [...oldData.pages];
          if (newPages.length > 0) {
            const firstPage = newPages[0];
            const currentData = firstPage.data || [];

            if (currentData.some((m: Message) => m.id === payload.id)) {
              return oldData;
            }

            newPages[0] = {
              ...firstPage,
              data: [...currentData, payload],
            };
          }
          return { ...oldData, pages: newPages };
        }
      );

      if (payload.type?.startsWith("system_")) {
        const actionData = (payload.action_data || {}) as {
          target_id?: string;
          new_role?: "owner" | "admin" | "member";
          actor_id?: string;
        };
        const { target_id, new_role, actor_id } = actionData;

        if (
          payload.type === "system_promote" ||
          payload.type === "system_demote" ||
          payload.type === "system_transfer"
        ) {
          queryClient.setQueriesData<InfiniteData<PaginatedResponse<GroupMember>>>(
            { queryKey: ["group-members", "infinite", payload.chat_id] },
            (oldData) => {
              if (!oldData) return oldData;
              const newPages = oldData.pages.map((page) => ({
                ...page,
                data: page.data.map((m) => {
                  if (m.user_id === target_id && new_role) {
                    return { ...m, role: new_role };
                  }

                  if (payload.type === "system_transfer" || new_role === "owner") {
                    const oldOwnerId = actor_id || payload.sender_id;
                    if (m.user_id === oldOwnerId) {
                      return { ...m, role: "admin" as const };
                    }
                  }

                  return m;
                }),
              }));
              return { ...oldData, pages: newPages };
            }
          );

          const oldOwnerId = actor_id || payload.sender_id;
          const amITarget = target_id === currentUser?.id;
          const amIOldOwner =
            (payload.type === "system_transfer" || new_role === "owner") &&
            oldOwnerId === currentUser?.id;

          if (amITarget || amIOldOwner) {
            const myNewRole = amITarget ? new_role : ("admin" as const);

            queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
              if (!oldChat) return oldChat;
              return { ...oldChat, my_role: myNewRole };
            });

            queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
              { queryKey: ["chats"] },
              (oldData) => {
                if (!oldData) return oldData;
                const newPages = oldData.pages.map((page) => ({
                  ...page,
                  data: page.data.map((chat) => {
                    if (chat.id === payload.chat_id) {
                      return { ...chat, my_role: myNewRole };
                    }
                    return chat;
                  }),
                }));
                return { ...oldData, pages: newPages };
              }
            );
          }
        }

        if (payload.type === "system_kick" || payload.type === "system_leave") {
          const removedUserId = target_id || payload.sender_id;
          const backendMemberCount = (payload as Message & { member_count?: number }).member_count;

          const amIKicked = payload.type === "system_kick" && removedUserId === currentUser?.id;

          if (amIKicked) {
            import("sonner").then(({ toast }) => {
              toast.error("You have been removed from the group", {
                id: `kicked-${payload.chat_id}`,
              });
            });

            queryClient.cancelQueries({ queryKey: ["chat", payload.chat_id] });
            queryClient.cancelQueries({ queryKey: ["messages", payload.chat_id] });

            queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
              { queryKey: ["chats"] },
              (oldData) => {
                if (!oldData) return oldData;
                const newPages = oldData.pages.map((page) => ({
                  ...page,
                  data: page.data.filter((chat) => chat.id !== payload.chat_id),
                }));
                return { ...oldData, pages: newPages };
              }
            );

            queryClient.removeQueries({ queryKey: ["chat", payload.chat_id] });
            queryClient.removeQueries({ queryKey: ["messages", payload.chat_id] });
            queryClient.removeQueries({
              queryKey: ["group-members", "infinite", payload.chat_id],
            });

            queryClient.invalidateQueries({ queryKey: ["chats"], refetchType: "none" });

            window.dispatchEvent(
              new CustomEvent("kicked-from-chat", { detail: { chatId: payload.chat_id } })
            );

            return;
          } else {
            queryClient.setQueriesData<InfiniteData<PaginatedResponse<GroupMember>>>(
              { queryKey: ["group-members", "infinite", payload.chat_id] },
              (oldData) => {
                if (!oldData) return oldData;
                const newPages = oldData.pages.map((page) => ({
                  ...page,
                  data: page.data.filter((m) => m.user_id !== removedUserId),
                }));
                return { ...oldData, pages: newPages };
              }
            );

            if (typeof backendMemberCount === "number") {
              queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
                if (!oldChat) return oldChat;
                return { ...oldChat, member_count: backendMemberCount };
              });

              queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
                { queryKey: ["chats"] },
                (oldData) => {
                  if (!oldData) return oldData;
                  const newPages = oldData.pages.map((page) => ({
                    ...page,
                    data: page.data.map((chat) => {
                      if (chat.id === payload.chat_id) {
                        return { ...chat, member_count: backendMemberCount };
                      }
                      return chat;
                    }),
                  }));
                  return { ...oldData, pages: newPages };
                }
              );
            } else {
              queryClient.invalidateQueries({ queryKey: ["chat", payload.chat_id] });
              queryClient.invalidateQueries({ queryKey: ["chats"] });
            }
          }
        }

        if (payload.type === "system_rename") {
          const actionData = payload.action_data as { new_name?: string };
          if (actionData.new_name) {
            queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
              if (!oldChat) return oldChat;
              return { ...oldChat, name: actionData.new_name! };
            });

            queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
              { queryKey: ["chats"] },
              (oldData) => {
                if (!oldData) return oldData;
                const newPages = oldData.pages.map((page) => ({
                  ...page,
                  data: page.data.map((chat) => {
                    if (chat.id === payload.chat_id) {
                      return { ...chat, name: actionData.new_name! };
                    }
                    return chat;
                  }),
                }));
                return { ...oldData, pages: newPages };
              }
            );
          }
        }

        if (payload.type === "system_visibility") {
          const actionData = payload.action_data as {
            new_visibility?: "public" | "private";
            invite_code?: string;
            invite_expires_at?: string;
          };
          const isPublic = actionData.new_visibility === "public";

          queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
            if (!oldChat) return oldChat;
            return {
              ...oldChat,
              is_public: isPublic,
              invite_code: actionData.invite_code || oldChat.invite_code,
              invite_expires_at: actionData.invite_expires_at || oldChat.invite_expires_at,
            };
          });

          queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
            { queryKey: ["chats"] },
            (oldData) => {
              if (!oldData) return oldData;
              const newPages = oldData.pages.map((page) => ({
                ...page,
                data: page.data.map((chat) => {
                  if (chat.id === payload.chat_id) {
                    return {
                      ...chat,
                      is_public: isPublic,
                      invite_code: actionData.invite_code || chat.invite_code,
                      invite_expires_at: actionData.invite_expires_at || chat.invite_expires_at,
                    };
                  }
                  return chat;
                }),
              }));
              return { ...oldData, pages: newPages };
            }
          );
        }

        if (payload.type === "system_add" || payload.type === "system_join") {
          const addedUserId = target_id || payload.sender_id;
          const amIAdded = addedUserId === currentUser?.id;
          const backendMemberCount = (payload as Message & { member_count?: number }).member_count;

          if (memberInvalidationTimeoutsRef.current[payload.chat_id]) {
            clearTimeout(memberInvalidationTimeoutsRef.current[payload.chat_id]);
          }

          memberInvalidationTimeoutsRef.current[payload.chat_id] = setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ["group-members", "infinite", payload.chat_id],
            });
            queryClient.invalidateQueries({
              queryKey: ["group-members", payload.chat_id],
            });
            delete memberInvalidationTimeoutsRef.current[payload.chat_id];
          }, 1000);

          if (!amIAdded) {
            if (typeof backendMemberCount === "number") {
              queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
                if (!oldChat) return oldChat;
                return { ...oldChat, member_count: backendMemberCount };
              });

              queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
                { queryKey: ["chats"] },
                (oldData) => {
                  if (!oldData) return oldData;
                  const newPages = oldData.pages.map((page) => ({
                    ...page,
                    data: page.data.map((chat) => {
                      if (chat.id === payload.chat_id) {
                        return { ...chat, member_count: backendMemberCount };
                      }
                      return chat;
                    }),
                  }));
                  return { ...oldData, pages: newPages };
                }
              );
            } else {
              queryClient.invalidateQueries({ queryKey: ["chat", payload.chat_id] });
              queryClient.invalidateQueries({ queryKey: ["chats"] });
            }
          }
        }
      }

      const activeChatId = useChatStore.getState().activeChatId;
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;

          let targetChat: ChatListItem | undefined;

          for (const page of oldData.pages) {
            const found = page.data.find((c) => c.id === payload.chat_id);
            if (found) {
              targetChat = found;
              break;
            }
          }

          if (!targetChat) {
            queryClient.invalidateQueries({ queryKey: ["chats"] });
            return oldData;
          }

          const updatedChat: ChatListItem = {
            ...targetChat,
            last_message: payload,
            unread_count:
              payload.sender_id !== currentUser?.id &&
              payload.chat_id !== activeChatId &&
              !payload.type?.startsWith("system_")
                ? (targetChat.unread_count || 0) + 1
                : targetChat.unread_count,
          };

          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.filter((c) => c.id !== payload.chat_id),
          }));

          if (newPages.length > 0) {
            newPages[0] = {
              ...newPages[0],
              data: [updatedChat, ...newPages[0].data],
            };
          }

          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
        if (!oldChat) return oldChat;
        return {
          ...oldChat,
          last_message: payload,
          unread_count:
            payload.sender_id !== currentUser?.id &&
            payload.chat_id !== activeChatId &&
            !payload.type?.startsWith("system_")
              ? (oldChat.unread_count || 0) + 1
              : oldChat.unread_count,
        };
      });

      if (payload.chat_id && payload.sender_id) {
        setUserTyping(payload.chat_id, payload.sender_id, false);
        const key = `${payload.chat_id}-${payload.sender_id}`;
        clearTypingTimeout(key);
      }
    },
    [currentUser, queryClient, setUserTyping, clearTypingTimeout]
  );

  const handleMessageUpdate = useCallback(
    (payload: Message & { is_read?: boolean }, meta?: { timestamp?: number | string | null }) => {
      let readReceiptAt: string | null = null;

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<Message>>>(
        { queryKey: ["messages", payload.chat_id] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((m: Message) => {
              if (m.id === payload.id) {
                if (payload.is_read && m.sender_id === currentUser?.id) {
                  readReceiptAt = getReadReceiptTimestamp(meta, new Date(m.created_at));
                }
                return { ...m, ...payload };
              }
              return m;
            }),
          }));
          return { ...oldData, pages: newPages };
        }
      );
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat: ChatListItem) => {
              if (chat.last_message?.id === payload.id) {
                return {
                  ...chat,
                  last_message: { ...chat.last_message, ...payload },
                  other_last_read_at: readReceiptAt
                    ? getLatestReadReceiptTimestamp(chat.other_last_read_at, readReceiptAt)
                    : chat.other_last_read_at,
                };
              }
              if (chat.id === payload.chat_id && readReceiptAt) {
                return {
                  ...chat,
                  other_last_read_at: getLatestReadReceiptTimestamp(
                    chat.other_last_read_at,
                    readReceiptAt
                  ),
                };
              }
              return chat;
            }),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      if (readReceiptAt) {
        const nextReadReceiptAt = readReceiptAt;
        queryClient.setQueryData<ChatListItem>(["chat", payload.chat_id], (oldChat) => {
          if (!oldChat) return oldChat;
          return {
            ...oldChat,
            other_last_read_at: getLatestReadReceiptTimestamp(
              oldChat.other_last_read_at,
              nextReadReceiptAt
            ),
          };
        });
      }

      if (payload.chat_id && payload.sender_id) {
        setUserTyping(payload.chat_id, payload.sender_id, false);
        const key = `${payload.chat_id}-${payload.sender_id}`;
        clearTypingTimeout(key);
      }
    },
    [currentUser?.id, queryClient, setUserTyping, clearTypingTimeout]
  );

  const handleMessageDelete = useCallback(
    (data: { payload: unknown; meta?: { timestamp?: number } }) => {
      const { message_id } = data.payload as { message_id: string };
      const timestamp = data.meta?.timestamp || Date.now();
      const deletedAt = new Date(timestamp).toISOString();

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<Message>>>(
        { queryKey: ["messages"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((m: Message) => {
              if (m.id === message_id) {
                return {
                  ...m,
                  deleted_at: deletedAt,
                  content: null,
                  attachments: [],
                  reply_to: null,
                };
              }

              if (m.reply_to?.id === message_id) {
                return {
                  ...m,
                  reply_to: {
                    ...m.reply_to,
                    deleted_at: deletedAt,
                    content: null,
                    attachments: [],
                  },
                };
              }

              return m;
            }),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat: ChatListItem) => {
              if (chat.last_message?.id === message_id) {
                return {
                  ...chat,
                  last_message: {
                    ...chat.last_message,
                    deleted_at: deletedAt,
                    content: null,
                    attachments: [],
                  },
                };
              }
              return chat;
            }),
          }));
          return { ...oldData, pages: newPages };
        }
      );
    },
    [queryClient]
  );

  return { handleMessageNew, handleMessageUpdate, handleMessageDelete };
};
