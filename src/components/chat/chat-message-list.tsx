import { ChatLoading } from "@/components/chat/chat-loading";
import { ChatRetry } from "@/components/chat/chat-retry";
import MessageBubble from "@/components/chat/message-bubble";
import { SystemMessage, SystemMessageBadge } from "@/components/chat/system-message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ChatItem } from "@/hooks/chat-room/use-virtua-chat";
import { cn } from "@/lib/utils";
import { ChatListItem, Media, Message, User } from "@/types";
import { RefreshCcw } from "lucide-react";
import React, { RefObject } from "react";
import { VList, VListHandle } from "virtua";

interface ChatMessageListProps {
  virtualizerRef: RefObject<VListHandle>;
  shifting: boolean;
  handleScroll: (offset: number) => void;
  items: ChatItem[];
  currentUser: User | null;
  chat: ChatListItem | null;
  setReplyTo: (message: Message | null) => void;
  setEditMessage: (message: Message | null) => void;
  setNewMessageText: (text: string) => void;
  setAttachmentMode: (mode: boolean) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  setMessageToDelete: (id: string | null) => void;
  setShowDeleteModal: (show: boolean) => void;
  setAttachments: (attachments: Media[]) => void;
  highlightedMessageId: string | null;
  handleJumpToMessage: (targetId: string, fromMessageId?: string) => void;
  messageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  activeMessageId: string | null;
  editMessage: Message | null;
  isGlobalBusy: boolean;
  partnerProfile?: User | null;
  handleClick: (messageId: string) => void;
  isMessagesLoading: boolean;
  isRemoteJumping: boolean;
  isMessagesError: boolean;
  jumpError: boolean;
  isRefetching: boolean;
  isReadyToDisplay: boolean;
  failedJumpTargetId: string | null;
  jumpTargetId: string | null;
  handleRemoteJump: (id: string) => void;
  refetchMessages: () => void;
  handleFetchNextPage: () => void;
  handleFetchPreviousPage: () => void;
  isJumped: boolean;
}

export const ChatMessageList = ({
  virtualizerRef,
  shifting,
  handleScroll,
  items,
  currentUser,
  chat,
  setReplyTo,
  setEditMessage,
  setNewMessageText,
  setAttachmentMode,
  textareaRef,
  setMessageToDelete,
  setShowDeleteModal,
  setAttachments,
  highlightedMessageId,
  handleJumpToMessage,
  messageRefs,
  activeMessageId,
  editMessage,
  isGlobalBusy,
  partnerProfile,
  handleClick,
  isMessagesLoading,
  isRemoteJumping,
  isMessagesError,
  jumpError,
  isReadyToDisplay,
  failedJumpTargetId,
  jumpTargetId,
  handleRemoteJump,
  refetchMessages,
  handleFetchNextPage,
  handleFetchPreviousPage,
  isJumped,
}: ChatMessageListProps) => {
  return (
    <div className="flex-1 min-h-0 w-full relative flex flex-col">
      {chat ? (
        <>
          {(isMessagesLoading && items.length === 0) ||
          isRemoteJumping ||
          (isJumped && isMessagesLoading) ||
          (!isReadyToDisplay && items.length > 0) ? (
            <ChatLoading />
          ) : null}

          {((isMessagesError && items.length === 0) || jumpError) && (
            <ChatRetry
              title={jumpError && !isMessagesError ? "Failed to load message" : undefined}
              description={
                jumpError && !isMessagesError
                  ? "Could not jump to the message. Please check your connection and try again."
                  : undefined
              }
              onRetry={() => {
                if (jumpError && failedJumpTargetId) {
                  handleRemoteJump(failedJumpTargetId);
                } else if (jumpError && jumpTargetId) {
                  handleRemoteJump(jumpTargetId);
                } else {
                  refetchMessages();
                }
              }}
            />
          )}

          <VList
            ref={virtualizerRef}
            className="h-full w-full chat-message-list py-1"
            style={{ height: "100%" }}
            shift={shifting}
            onScroll={handleScroll}
          >
            {items.map((item) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el && item.type === "message") {
                    messageRefs.current[item.message.id] = el;
                  }
                }}
                className={cn(
                  "px-2 py-1",
                  item.type === "date-separator" && "py-1 flex justify-center sticky-date-trigger"
                )}
              >
                {item.type === "message" ? (
                  item.message.type?.startsWith("system_") ? (
                    <SystemMessage message={item.message} />
                  ) : (
                    <MessageBubble
                      key={item.message.id}
                      message={item.message}
                      current={currentUser}
                      chat={chat}
                      setReplyTo={setReplyTo}
                      setEditMessage={setEditMessage}
                      setNewMessageText={setNewMessageText}
                      setAttachmentMode={setAttachmentMode}
                      textareaRef={textareaRef}
                      setMessageToDelete={setMessageToDelete}
                      setShowDeleteModal={setShowDeleteModal}
                      setAttachments={setAttachments}
                      highlightedMessageId={highlightedMessageId}
                      jumpToMessage={(id) => handleJumpToMessage(id, item.message.id)}
                      messageRefs={messageRefs}
                      activeMessageId={activeMessageId}
                      editMessage={editMessage}
                      isLoadingMessage={false}
                      isError={false}
                      handleClick={handleClick}
                      isBusy={isGlobalBusy}
                      partnerProfile={partnerProfile || undefined}
                    />
                  )
                ) : item.type === "date-separator" ? (
                  <SystemMessageBadge>{item.date}</SystemMessageBadge>
                ) : item.type === "loader" ? (
                  <div
                    className={cn(
                      "flex justify-center w-full",
                      item.id === "loader-top" ? "pb-1 pt-2" : "pt-1 pb-2"
                    )}
                  >
                    <div className="h-8 w-8 flex items-center justify-center rounded-full bg-transparent">
                      <Spinner className="h-4 w-4" />
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex justify-center w-full",
                      item.direction === "up" ? "pb-1 pt-2" : "pt-1 pb-2"
                    )}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full bg-background border text-foreground hover:bg-muted h-8 w-8"
                      onClick={() =>
                        item.direction === "up" ? handleFetchNextPage() : handleFetchPreviousPage()
                      }
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </VList>
        </>
      ) : (
        <ChatLoading />
      )}
    </div>
  );
};
