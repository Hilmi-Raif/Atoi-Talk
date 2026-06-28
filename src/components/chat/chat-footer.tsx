import { Captcha } from "@/components/auth/captcha";
import { FloatingChatButtons } from "@/components/chat/floating-chat-buttons";
import { ChatBlockState } from "@/components/chat/footer/chat-block-state";
import { ChatFileDropzone } from "@/components/chat/footer/chat-file-dropzone";
import { ChatInputArea } from "@/components/chat/footer/chat-input-area";
import { ChatReplyPreview } from "@/components/chat/footer/chat-reply-preview";
import { useWebSocketContext } from "@/context/websocket-context";
import { useChatUpload } from "@/hooks/chat-room/use-chat-upload";
import { useRefreshMedia } from "@/hooks/mutations/use-refresh-media";
import { useUserById } from "@/hooks/queries";
import { errorLog } from "@/lib/logger";
import { useUIStore } from "@/store";
import {
  ChatListItem,
  EditMessage,
  EditMessageRequest,
  Media,
  MediaUsage,
  Message,
  User,
} from "@/types";
import * as React from "react";

interface ChatFooterProps {
  replyTo: Message | null;
  editMessage: EditMessage | null;
  attachmentMode: boolean;
  attachments: Media[];
  current: User | null;
  chat?: ChatListItem;
  newMessageText: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setReplyTo: (replyTo: Message | null) => void;
  setEditMessage: (editMessage: EditMessage | null) => void;
  setAttachmentMode: (mode: boolean) => void;
  setAttachments: React.Dispatch<React.SetStateAction<Media[]>>;
  setNewMessageText: (text: string) => void;
  onSendMessage: (text: string, attachments: Media[]) => void;
  isSending?: boolean;
  showScrollButton: boolean;
  scrollToBottom: () => void;
  partnerProfile?: User | null;
  showReturnButton?: boolean;
  onReturnJump?: () => void;
  onEditMessage: (params: {
    messageId: string;
    chatId: string;
    data: EditMessageRequest;
    optimisticAttachments?: Media[];
  }) => Promise<unknown>;
  isEditing: boolean;
  uploadMedia: (variables: {
    file: File;
    usage: MediaUsage;
    captchaToken: string;
    signal?: AbortSignal;
  }) => Promise<Media>;
  isUploading: boolean;
  isLoading?: boolean;
  uploadingFiles: File[];
  setUploadingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  uploadingKeysRef: React.MutableRefObject<Set<string>>;
}

const ChatFooter = ({
  replyTo,
  editMessage,
  attachmentMode,
  attachments,
  newMessageText,
  textareaRef,
  setReplyTo,
  setEditMessage,
  setAttachmentMode,
  setAttachments,
  setNewMessageText,
  onSendMessage,
  isSending,
  showScrollButton,
  scrollToBottom,
  partnerProfile,
  chat,
  showReturnButton,
  onReturnJump,
  current,
  onEditMessage,
  isEditing,
  uploadMedia,
  isUploading,
  isLoading = false,
  setUploadingFiles: setPropUploadingFiles,
}: ChatFooterProps) => {
  const [isEmojiOpen, setIsEmojiOpen] = React.useState(false);
  const fileListRef = React.useRef<HTMLDivElement>(null);
  const lastTypingRef = React.useRef(0);

  const {
    uploadingFiles,
    setUploadingFiles,
    isSolvingCaptcha,
    setIsSolvingCaptcha,
    isCancelling,
    pendingUploadsRef,
    captchaRef,
    handleFilesChange,
    handleCancelUploads,
    handleCaptchaError,
    processNextFile,
  } = useChatUpload({ uploadMedia, setAttachments, attachments });

  React.useEffect(() => {
    if (setPropUploadingFiles) {
      setPropUploadingFiles(uploadingFiles);
    }
  }, [uploadingFiles, setPropUploadingFiles]);

  const setBusy = useUIStore((state) => state.setBusy);
  const isGlobalUploading = isUploading || isSolvingCaptcha;

  React.useEffect(() => {
    setBusy(isGlobalUploading || isSending || false);
    return () => setBusy(false);
  }, [isGlobalUploading, isSending, setBusy]);

  const isBlockedByMe = partnerProfile?.is_blocked_by_me;
  const isBlockedByOther = partnerProfile?.is_blocked_by_other;
  const isDeleted = chat?.type === "private" && chat?.other_user_is_deleted;
  const isBanned =
    (chat?.type === "private" && chat?.other_user_is_banned) || partnerProfile?.is_banned;

  const { sendTyping } = useWebSocketContext();
  const { mutateAsync: refreshMedia } = useRefreshMedia(chat?.id ?? "");

  const {
    data: replySender,
    isError: isReplySenderError,
    isLoading: isReplySenderLoading,
  } = useUserById(replyTo?.sender_id ?? null);

  const isReplyProfileMissing = !isReplySenderLoading && (!replySender || isReplySenderError);
  const replySenderNameFromProfile = replySender?.full_name;

  const effectiveReplySenderName = isReplyProfileMissing
    ? "Deleted Account"
    : replySenderNameFromProfile || replyTo?.sender_name || "Unknown User";

  const isReplySenderDeleted =
    effectiveReplySenderName === "Deleted Account" ||
    effectiveReplySenderName === "Deleted User" ||
    (!!replySender && !replySenderNameFromProfile) ||
    isReplyProfileMissing;

  const finalReplySenderName = isReplySenderDeleted ? "Deleted Account" : effectiveReplySenderName;

  const handleRefreshMedia = async (mediaId: string) => {
    if (!editMessage?.id) return;
    try {
      const { newUrl } = await refreshMedia({ mediaId, messageId: editMessage.id });

      setEditMessage({
        ...editMessage,
        attachments:
          editMessage.attachments?.map((att) =>
            att.id === mediaId ? { ...att, url: newUrl } : att
          ) ?? null,
      });
    } catch (error) {
      errorLog("Failed to refresh media in edit mode", error);
    }
  };

  const handleTyping = () => {
    if (!chat?.id) return;
    const now = Date.now();
    if (now - lastTypingRef.current > 3000) {
      sendTyping(chat.id);
      lastTypingRef.current = now;
    }
  };

  React.useEffect(() => {
    if (fileListRef.current) {
      fileListRef.current.scrollTop = fileListRef.current.scrollHeight;
    }
  }, [attachments, editMessage?.attachments, uploadingFiles]);

  const handleSendMessage = async () => {
    if (editMessage) {
      if (!chat) return;

      const keptAttachments = editMessage.attachments?.filter((item) => !item.delete) || [];
      const finalAttachments = [...keptAttachments, ...attachments];
      const attachmentIds = finalAttachments.map((a) => a.id);

      const isContentSame = newMessageText.trim() === (editMessage.content || "").trim();
      const isAttachmentsSame =
        attachments.length === 0 && (editMessage.attachments || []).every((att) => !att.delete);

      if (isContentSame && isAttachmentsSame) {
        setEditMessage(null);
        setNewMessageText("");
        setAttachments([]);
        setAttachmentMode(false);
        return;
      }

      if (attachmentIds.length === 0 && newMessageText.trim() === "") {
        return;
      }

      try {
        await onEditMessage({
          messageId: editMessage.id,
          chatId: chat.id,
          data: {
            content: newMessageText,
            attachment_ids: attachmentIds,
          },
          optimisticAttachments: finalAttachments,
        });
        setEditMessage(null);
        setNewMessageText("");
        setAttachments([]);
        setAttachmentMode(false);
      } catch (error) {
        errorLog("Failed to edit message", error);
      }
      return;
    }

    if (attachments.length === 0 && newMessageText.trim() === "") {
      return;
    }

    if (isUploading || isSolvingCaptcha) {
      return;
    }

    onSendMessage(newMessageText, attachments);
  };

  if (isDeleted || isBanned || isBlockedByMe || isBlockedByOther) {
    return (
      <ChatBlockState
        isDeleted={isDeleted}
        isBanned={isBanned}
        isBlockedByMe={isBlockedByMe}
        isBlockedByOther={isBlockedByOther}
        showReturnButton={showReturnButton}
        onReturnJump={onReturnJump}
        showScrollButton={showScrollButton}
        scrollToBottom={scrollToBottom}
      />
    );
  }

  return (
    <footer className="relative mx-auto p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] gap-2 w-full flex flex-col items-start bg-background border-t">
      <Captcha
        ref={captchaRef}
        mode="execute"
        onVerify={(token) => {
          if (pendingUploadsRef.current.length > 0) {
            processNextFile(token);
          } else {
            setIsSolvingCaptcha(false);
          }
        }}
        onError={() => {
          if (import.meta.env.DEV) {
            console.warn("Security check failed.");
          }
          handleCaptchaError();
        }}
        onExpire={() => {
          if (pendingUploadsRef.current.length > 0) {
            captchaRef.current?.execute();
          } else {
            setIsSolvingCaptcha(false);
          }
        }}
      />

      <FloatingChatButtons
        showReturnButton={showReturnButton}
        onReturnJump={onReturnJump}
        showScrollButton={showScrollButton}
        scrollToBottom={scrollToBottom}
      />

      <div className="flex flex-col w-full gap-2">
        <ChatReplyPreview
          replyTo={replyTo}
          editMessage={editMessage}
          current={current}
          finalReplySenderName={finalReplySenderName}
          isGlobalUploading={isGlobalUploading}
          isSending={isSending}
          isLoading={isLoading}
          textareaRef={textareaRef}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => {
            setNewMessageText("");
            setEditMessage(null);
            setAttachmentMode(false);
            setAttachments([]);
            if (textareaRef.current) {
              textareaRef.current.value = "";
              textareaRef.current.focus();
            }
          }}
        />

        <ChatFileDropzone
          attachmentMode={attachmentMode}
          uploadingFiles={uploadingFiles}
          onFilesChange={handleFilesChange}
          isGlobalUploading={isGlobalUploading}
          isSending={!!isSending}
          isEditing={!!isEditing}
          isCancelling={isCancelling}
          isLoading={isLoading}
          attachments={attachments}
          editMessage={editMessage}
          fileListRef={fileListRef as React.RefObject<HTMLDivElement>}
          onRefreshMedia={handleRefreshMedia}
          onRemoveAttachment={(mediaId) =>
            setAttachments(attachments.filter((a) => a.id !== mediaId))
          }
          onRemoveEditAttachment={(index) => {
            if (!editMessage) return;
            const updatedAttachments =
              editMessage.attachments?.map((att, idx) => {
                if (idx === index) {
                  return { ...att, delete: true };
                }
                return att;
              }) ?? editMessage?.attachments;

            setEditMessage({
              ...editMessage,
              attachments: updatedAttachments,
            });
          }}
          onCancelUploads={handleCancelUploads}
        />

        <ChatInputArea
          isGlobalUploading={isGlobalUploading}
          isSending={!!isSending}
          isEditing={!!isEditing}
          isLoading={isLoading}
          attachmentMode={attachmentMode}
          onAttachmentModeChange={(mode) => {
            setAttachmentMode(mode);
            if (mode) {
              if (!isGlobalUploading && !isSending) {
                setAttachments([]);
                setUploadingFiles([]);
                if (editMessage) {
                  const updatedEditMessage = {
                    ...editMessage,
                    attachments:
                      editMessage.attachments?.map((att) => ({
                        ...att,
                        delete: true,
                      })) ?? [],
                  };
                  setEditMessage(updatedEditMessage);
                }
              }
            }
          }}
          isEmojiOpen={isEmojiOpen}
          onEmojiOpenChange={setIsEmojiOpen}
          onEmojiSelect={(emoji) => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = newMessageText;
            const nextText = text.substring(0, start) + emoji.native + text.substring(end);

            setNewMessageText(nextText);

            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + emoji.native.length;
              textarea.focus();
            }, 0);
          }}
          textareaRef={textareaRef}
          newMessageText={newMessageText}
          onNewMessageTextChange={setNewMessageText}
          onSendMessage={handleSendMessage}
          onTyping={handleTyping}
        />
      </div>
    </footer>
  );
};

export default ChatFooter;
