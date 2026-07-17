import { debugLog, errorLog } from "@/lib/logger";
import { messageService } from "@/services";
import { useChatStore } from "@/store";
import type {
  ChatListItem,
  GetMessagesParams,
  Message,
  PaginatedResponse,
  SendMessageRequest,
} from "@/types";
import { InfiniteData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { useCallback, useState } from "react";

export function useMessages(chatId: string | null, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ["messages", chatId],
    queryFn: ({ pageParam, direction, signal }) => {
      const finalParams: GetMessagesParams = {
        limit: 30,
      };

      if (pageParam) {
        finalParams.cursor = pageParam as string;

        if (direction === "backward") {
          finalParams.direction = "newer";
        }
      }

      debugLog("Fetching messages page", {
        chatId,
        pageParam: pageParam ?? null,
        direction: direction ?? null,
        params: finalParams,
      });
      return messageService.getMessages(chatId!, finalParams, signal);
    },
    initialPageParam: undefined as string | undefined,

    getNextPageParam: (lastPage) =>
      lastPage.meta.has_next ? lastPage.meta.next_cursor : undefined,

    getPreviousPageParam: (firstPage) =>
      firstPage.meta.has_prev ? firstPage.meta.prev_cursor : undefined,
    enabled: chatId !== null && (options?.enabled ?? true),
    retry: (failureCount, error) => {
      const axiosError = error as AxiosError;
      if (
        axiosError?.response?.status === 403 ||
        axiosError?.response?.status === 404 ||
        axiosError?.response?.status === 400
      )
        return false;
      return failureCount < 3;
    },
    refetchOnWindowFocus: false,
  });
}

export function useJumpToMessage(chatId: string | null) {
  const queryClient = useQueryClient();
  const [jumpTargetId, setJumpTargetId] = useState<string | null>(null);
  const [jumpTimestamp, setJumpTimestamp] = useState<number | null>(null);
  const setIsJumped = useChatStore((s) => s.setIsJumped);
  const isJumped = useChatStore((s) => s.isJumped);

  const jumpToMessage = useCallback(
    async (targetMessageId: string): Promise<boolean> => {
      if (!chatId) {
        debugLog("Jump to message skipped: chatId is null", { targetMessageId });
        return false;
      }

      const currentData = queryClient.getQueryData<InfiniteData<PaginatedResponse<Message>>>([
        "messages",
        chatId,
      ]);
      const currentMessages = currentData?.pages.flatMap((p) => p.data) || [];
      const inCache = currentMessages.some((m) => m.id === targetMessageId);

      if (inCache) {
        debugLog("Jump to message cache hit", { chatId, targetMessageId });
        setJumpTargetId(targetMessageId);
        setJumpTimestamp(Date.now());

        const targetIndex = currentMessages.findIndex((m) => m.id === targetMessageId);
        const distanceFromNewest = currentMessages.length - 1 - targetIndex;
        if (distanceFromNewest > 15) {
          setIsJumped(true);
        }
        return true;
      }

      let attempts = 0;
      const maxAttempts = 3;
      debugLog("Jump to message cache miss, requesting around target", {
        chatId,
        targetMessageId,
        maxAttempts,
      });

      while (attempts < maxAttempts) {
        try {
          debugLog("Jump to message attempt", {
            chatId,
            targetMessageId,
            attempt: attempts + 1,
          });
          const jumpData = await messageService.getMessages(chatId, {
            around_message_id: targetMessageId,
            limit: 30,
          });

          queryClient.setQueryData<InfiniteData<PaginatedResponse<Message>>>(["messages", chatId], {
            pages: [jumpData],
            pageParams: [undefined],
          });

          setIsJumped(true);
          setJumpTargetId(targetMessageId);
          setJumpTimestamp(Date.now());
          debugLog("Jump to message success", { chatId, targetMessageId, attempt: attempts + 1 });
          return true;
        } catch (error) {
          attempts++;
          errorLog(`Jump to message attempt ${attempts} failed:`, error);
          debugLog("Jump to message attempt failed", {
            chatId,
            targetMessageId,
            attempt: attempts,
          });

          if (attempts >= maxAttempts) {
            debugLog("Jump to message failed after max attempts", { chatId, targetMessageId });
            return false;
          }

          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
        }
      }
      return false;
    },
    [chatId, queryClient, setIsJumped]
  );

  const returnToLatest = useCallback(() => {
    if (!chatId) return;
    debugLog("Return to latest triggered", { chatId });

    queryClient.removeQueries({ queryKey: ["messages", chatId] });

    setIsJumped(false);
    setJumpTargetId(null);
    setJumpTimestamp(null);

    queryClient.refetchQueries({ queryKey: ["messages", chatId] });
  }, [chatId, queryClient, setIsJumped]);

  const clearJumpState = useCallback(() => {
    setIsJumped(false);
    setJumpTargetId(null);
    setJumpTimestamp(null);
  }, [setIsJumped]);

  return {
    jumpToMessage,
    returnToLatest,
    clearJumpState,
    isJumped,
    jumpTargetId,
    jumpTimestamp,
  };
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageRequest) => messageService.sendMessage(data),
    onSuccess: (newMessage) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<Message>>>(
        { queryKey: ["messages", newMessage.chat_id], exact: true },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = [...oldData.pages];
          if (newPages.length > 0) {
            const firstPage = newPages[0];
            const currentData = firstPage.data || [];
            if (currentData.some((m) => m.id === newMessage.id)) return oldData;
            newPages[0] = {
              ...firstPage,
              data: [...currentData, newMessage],
            };
          }
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((chat) => {
              if (chat.id === newMessage.chat_id) {
                return {
                  ...chat,
                  last_message: newMessage,
                };
              }
              return chat;
            }),
          }));
          return { ...oldData, pages: newPages };
        }
      );

      queryClient.setQueryData<ChatListItem>(["chat", newMessage.chat_id], (oldChat) => {
        if (!oldChat) return oldChat;
        return {
          ...oldChat,
          last_message: newMessage,
        };
      });
    },
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId }: { messageId: string; chatId: string }) =>
      messageService.deleteMessage(messageId),
    onMutate: async ({ messageId, chatId }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", chatId] });

      const previousMessages = queryClient.getQueryData<InfiniteData<PaginatedResponse<Message>>>([
        "messages",
        chatId,
      ]);

      queryClient.setQueryData<InfiniteData<PaginatedResponse<Message>>>(
        ["messages", chatId],
        (old) => {
          if (!old) return old;
          const newPages = old.pages.map((page) => ({
            ...page,
            data: page.data.map((msg) =>
              msg.id === messageId ? { ...msg, deleted_at: new Date().toISOString() } : msg
            ),
          }));
          return { ...old, pages: newPages };
        }
      );

      return { previousMessages };
    },
    onSuccess: (_data, { messageId, chatId }) => {
      queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
        { queryKey: ["chats"] },
        (oldData) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              data: page.data.map((chat) => {
                if (chat.id === chatId && chat.last_message?.id === messageId) {
                  return {
                    ...chat,
                    last_message: {
                      ...chat.last_message,
                      deleted_at: new Date().toISOString(),
                    },
                  };
                }
                return chat;
              }),
            })),
          };
        }
      );
    },
    onError: (_error, { chatId }, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", chatId], context.previousMessages);
      }
    },
  });
}
