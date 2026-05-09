import ChatFooter from "@/components/chat/chat-footer";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ChatRoomHeader } from "@/components/chat/chat-room-header";
import { SystemMessageBadge } from "@/components/chat/system-message";
import { DeleteMessageDialog } from "@/components/modals/delete-message-dialog.tsx";
import { SidebarInset } from "@/components/ui/sidebar.tsx";
import { useChatRoom } from "@/hooks/chat-room/use-chat-room";
import { RefObject } from "react";
import { VListHandle } from "virtua";

const ChatRoom = () => {
  const {
    chat,
    partnerId,
    partnerProfile,
    isProfileError,
    isProfileLoading,
    isProfileFetching,
    refetchProfile,
    isChatLoading,
    isChatFetching,
    isChatError,
    refetchChat,
    chatError,
    chatFailureCount,
    profileFailureCount,
    currentUser,
    isVirtual,
    profileError,

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
    isReadyToDisplay,
    isJumped,
    jumpError,
    jumpTargetId,
    failedJumpTargetId,
    isRemoteJumping,
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
    returnStack,
  } = useChatRoom();

  return (
    <SidebarInset className="flex flex-col h-[100dvh] relative overflow-hidden bg-sidebar">
      <ChatRoomHeader
        chat={chat || null}
        partnerId={partnerId || null}
        partnerProfile={partnerProfile}
        isProfileError={isProfileError}
        isProfileLoading={isProfileLoading}
        isProfileFetching={isProfileFetching}
        refetchProfile={refetchProfile}
        isChatLoading={isChatLoading}
        isChatFetching={isChatFetching}
        isChatError={isChatError}
        refetchChat={refetchChat}
        isVirtual={isVirtual}
        chatFailureCount={chatFailureCount}
        profileFailureCount={profileFailureCount}
        chatError={chatError}
        profileError={profileError}
      />

      {isStickyDateVisible && displayedStickyDate && (
        <div className="absolute top-[63px] left-0 right-0 z-20 pointer-events-none flex justify-center py-2 sm:pr-2">
          <SystemMessageBadge>{displayedStickyDate}</SystemMessageBadge>
        </div>
      )}

      <ChatMessageList
        virtualizerRef={virtualizerRef as RefObject<VListHandle>}
        shifting={shifting}
        handleScroll={handleScroll}
        items={items}
        currentUser={currentUser}
        chat={chat || null}
        setReplyTo={setReplyTo}
        setEditMessage={setEditMessage}
        setNewMessageText={setNewMessageText}
        setAttachmentMode={setAttachmentMode}
        textareaRef={textareaRef}
        setMessageToDelete={setMessageToDelete}
        setShowDeleteModal={setShowDeleteModal}
        setAttachments={setAttachments}
        highlightedMessageId={highlightedMessageId ?? null}
        handleJumpToMessage={handleJumpToMessage}
        messageRefs={messageRefs}
        activeMessageId={activeMessageId ?? null}
        editMessage={editMessage}
        isGlobalBusy={isGlobalBusy}
        partnerProfile={partnerProfile}
        handleClick={handleClick}
        isMessagesLoading={isMessagesLoading}
        isRemoteJumping={isRemoteJumping}
        isMessagesError={isMessagesError}
        jumpError={jumpError}
        isRefetching={isRefetching}
        isReadyToDisplay={isReadyToDisplay}
        failedJumpTargetId={failedJumpTargetId}
        jumpTargetId={jumpTargetId}
        handleRemoteJump={handleRemoteJump}
        refetchMessages={refetchMessages}
        handleFetchNextPage={handleFetchNextPage}
        handleFetchPreviousPage={handleFetchPreviousPage}
        isJumped={isJumped}
      />

      <ChatFooter
        onSendMessage={handleSendMessage}
        onEditMessage={(params) =>
          handleEditMessage(params.data.content || "", params.optimisticAttachments || [])
        }
        replyTo={replyTo}
        setReplyTo={setReplyTo}
        editMessage={editMessage}
        setEditMessage={setEditMessage}
        textareaRef={textareaRef}
        newMessageText={newMessageText}
        setNewMessageText={setNewMessageText}
        attachments={attachments}
        setAttachments={setAttachments}
        attachmentMode={attachmentMode}
        setAttachmentMode={setAttachmentMode}
        uploadingFiles={uploadingFiles}
        setUploadingFiles={setUploadingFiles}
        uploadingKeysRef={uploadingKeysRef}
        isUploading={isUploading}
        isSending={isSending}
        uploadMedia={uploadMedia}
        partnerProfile={partnerProfile}
        chat={chat || undefined}
        scrollToBottom={handleScrollToBottom}
        showScrollButton={showScrollButton}
        showReturnButton={returnStack.length > 0}
        onReturnJump={handleReturnJump}
        current={currentUser}
        isEditing={isEditing}
      />

      <DeleteMessageDialog
        showDeleteModal={showDeleteModal}
        setShowDeleteModal={setShowDeleteModal}
        messageToDelete={messageToDelete}
        editMessage={editMessage}
        replyTo={replyTo}
        setEditMessage={setEditMessage}
        setAttachmentMode={setAttachmentMode}
        textareaRef={textareaRef}
        setReplyTo={setReplyTo}
        onConfirmDelete={() => messageToDelete && handleDeleteMessage(messageToDelete)}
        isLoading={isDeleteSubmitting}
      />
    </SidebarInset>
  );
};

export default ChatRoom;
