import { useChatActions } from "@/hooks/chat-room/use-chat-room-actions";
import { useChatData } from "@/hooks/chat-room/use-chat-room-data";
import { useChatMessages } from "@/hooks/chat-room/use-chat-room-messages";
import { useMarkAsRead } from "@/hooks/mutations/use-mark-read";
import { ChatListItem, PaginatedResponse } from "@/types";
import { InfiniteData } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";

export const useChatRoom = () => {
  const {
    queryClient,
    currentChatId,
    targetUserId,
    isVirtual,
    currentUser,
    activeChatId,
    chat,
    isLoadingSingleChat: isChatLoading,
    isChatError,
    refetchChat,
    isFetchingSingleChat,
    chatFailureCount,
    chatError,
    partnerId,
    partnerProfile,
    isProfileError,
    isProfileLoading,
    isFetchingProfile,
    refetchProfile,
    profileFailureCount,
    profileError,
  } = useChatData();

  useLayoutEffect(() => {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  const {
    messages,
    items,
    virtualizerRef,
    shifting,
    handleScroll,
    displayedStickyDate,
    isStickyDateVisible,
    isMessagesLoading,
    isMessagesError,
    isRefetching,
    refetchMessages,
    isJumped,
    jumpError,
    jumpTargetId,
    failedJumpTargetId,
    isRemoteJumping,
    returnToMessageId,
    handleRemoteJump,
    handleJumpToMessage,
    handleReturnJump,
    handleScrollToBottom,
    showScrollButton,
    highlightedMessageId,
    handleFetchNextPage,
    handleFetchPreviousPage,
    isReadyToDisplay,
    returnStack,
  } = useChatMessages({
    currentChatId,
    activeChatId,
    chat,
    isVirtual,
    chatError,
    isChatError,
    isLoadingSingleChat: isChatLoading,
    isFetchingSingleChat,
  });

  const {
    newMessageText,
    setNewMessageText,
    editMessage,
    setEditMessage,
    activeMessageId,
    replyTo,
    setReplyTo,
    showDeleteModal,
    setShowDeleteModal,
    messageToDelete,
    setMessageToDelete,
    messageRefs,
    attachments,
    setAttachments,
    attachmentMode,
    setAttachmentMode,
    textareaRef,
    uploadingFiles,
    setUploadingFiles,
    uploadingKeysRef,
    isUploading,
    isDeleteSubmitting,
    isGlobalBusy,
    isSending,
    isEditing,
    handleClick,
    handleSendMessage,
    handleDeleteMessage,
    handleEditMessage,
    uploadMedia,
  } = useChatActions({
    currentChatId,
    isVirtual,
    targetUserId,
    messages,
    scrollToBottom: handleScrollToBottom,
  });

  const { mutate: markAsRead } = useMarkAsRead();

  useEffect(() => {
    if (!currentChatId || activeChatId !== currentChatId) return;

    queryClient.setQueriesData<InfiniteData<PaginatedResponse<ChatListItem>>>(
      { queryKey: ["chats"] },
      (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            data: page.data.map((c) => (c.id === currentChatId ? { ...c, unread_count: 0 } : c)),
          })),
        };
      }
    );

    queryClient.setQueryData<ChatListItem>(["chat", currentChatId], (old) =>
      old ? { ...old, unread_count: 0 } : old
    );

    const unreadCount = chat?.unread_count || 0;
    if (unreadCount > 0) {
      markAsRead(currentChatId);
    }
  }, [currentChatId, activeChatId, queryClient, markAsRead, chat?.unread_count]);

  const displayMessages = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const lastMessage = displayMessages[displayMessages.length - 1];
  const lastMessageId = lastMessage?.id;
  const lastMessageSenderId = lastMessage?.sender_id;
  const lastMarkedReadMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentChatId || activeChatId !== currentChatId || !lastMessageId) return;

    const isMyMessage = lastMessageSenderId === currentUser?.id;
    const isAlreadyMarked = lastMarkedReadMessageIdRef.current === lastMessageId;

    if (!isMyMessage && !isAlreadyMarked) {
      const unreadCount = chat?.unread_count || 0;

      if (unreadCount === 0) {
        markAsRead(currentChatId);
      }

      lastMarkedReadMessageIdRef.current = lastMessageId;
    }
  }, [
    currentChatId,
    activeChatId,
    lastMessageId,
    lastMessageSenderId,
    currentUser?.id,
    markAsRead,
    chat?.unread_count,
  ]);

  return {
    chat,
    partnerId,
    partnerProfile,
    isProfileError,
    isProfileLoading,
    isProfileFetching: isFetchingProfile,
    refetchProfile,
    isChatLoading,
    isChatFetching: isFetchingSingleChat,
    isChatError,
    refetchChat,
    chatError,
    chatFailureCount,
    profileFailureCount,
    profileError,
    currentUser,

    items,
    virtualizerRef,
    shifting,
    handleScroll,
    displayedStickyDate,
    isStickyDateVisible,
    isMessagesLoading,
    isMessagesError,
    isRefetching,
    refetchMessages,

    isJumped,
    jumpError,
    jumpTargetId,
    failedJumpTargetId,
    isRemoteJumping,
    returnToMessageId,
    handleRemoteJump,
    handleJumpToMessage,
    handleReturnJump,
    handleScrollToBottom,
    showScrollButton,

    messageRefs,
    highlightedMessageId,
    activeMessageId,
    handleClick,

    newMessageText,
    setNewMessageText,
    editMessage,
    setEditMessage,
    replyTo,
    setReplyTo,
    attachments,
    setAttachments,
    attachmentMode,
    setAttachmentMode,
    isGlobalBusy,
    isSending,
    isEditing,
    textareaRef,

    uploadingFiles,
    setUploadingFiles,
    uploadingKeysRef,
    isUploading,
    uploadMedia,

    showDeleteModal,
    setShowDeleteModal,
    messageToDelete,
    setMessageToDelete,
    isDeleteSubmitting,
    handleDeleteMessage,

    handleSendMessage,
    handleEditMessage,
    handleFetchNextPage,
    handleFetchPreviousPage,

    isVirtual,
    isReadyToDisplay,
    returnStack,
  };
};
