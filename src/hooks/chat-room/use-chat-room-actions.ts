import { useEditMessage } from "@/hooks/mutations/use-edit-message";
import { useMarkAsRead } from "@/hooks/mutations/use-mark-read";
import { useUploadMedia } from "@/hooks/mutations/use-upload-media";
import { useCreatePrivateChat, useDeleteMessage, useSendMessage } from "@/hooks/queries";
import { debugLog } from "@/lib/logger";
import { toast } from "@/lib/toast";
import { EditMessageRequest, Media, MediaUsage, Message, MessageType } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface UseChatActionsProps {
  currentChatId: string | null;
  isVirtual: boolean;
  targetUserId: string | null;
  messages: Message[];
  scrollToBottom: () => void;
}

export const useChatActions = ({
  currentChatId,
  isVirtual,
  targetUserId,
  messages,
  scrollToBottom,
}: UseChatActionsProps) => {
  const navigate = useNavigate();

  const [newMessageText, setNewMessageText] = useState("");
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<null | Message>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [attachments, setAttachments] = useState<Media[]>([]);
  const [attachmentMode, setAttachmentMode] = useState(false);

  const [createdChatId, setCreatedChatId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutate: createPrivateChat } = useCreatePrivateChat();
  const { mutate: deleteMessageMutation } = useDeleteMessage();
  const { mutateAsync: editMessageMutation, isPending: isEditing } = useEditMessage();
  const { mutate: markAsRead } = useMarkAsRead();

  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const uploadingKeysRef = useRef<Set<string>>(new Set());

  const { mutateAsync: uploadMediaMutation, isPending: isUploadingState } = useUploadMedia();
  const uploadMedia = useCallback(
    (variables: { file: File; usage: MediaUsage; captchaToken: string; signal?: AbortSignal }) =>
      uploadMediaMutation(variables),
    [uploadMediaMutation]
  );
  const isUploading = isUploadingState || uploadingFiles.length > 0;

  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const isGlobalBusy = isSending || isEditing || isDeleteSubmitting || isUploading;

  useEffect(() => {
    if (!replyTo) return;
    const updatedMessage = messages.find((m) => m.id === replyTo.id);

    if (updatedMessage) {
      if (updatedMessage.deleted_at) {
        setReplyTo(null);
        return;
      }

      if (
        updatedMessage.edited_at !== replyTo.edited_at ||
        updatedMessage.content !== replyTo.content ||
        (updatedMessage.attachments?.length ?? 0) !== (replyTo.attachments?.length ?? 0)
      ) {
        setReplyTo(updatedMessage);
      }
    }
  }, [messages, replyTo]);

  useEffect(() => {
    setNewMessageText("");
    setEditMessage(null);
    setReplyTo(null);
    setAttachments([]);
    setAttachmentMode(false);
    setActiveMessageId(null);
    setShowDeleteModal(false);
    messageRefs.current = {};
  }, [currentChatId]);

  useEffect(() => {
    if (!editMessage) return;

    const createdTime = new Date(editMessage.created_at).getTime();

    const LIMIT_MS = 15 * 60 * 1000 - 10 * 1000;
    const diff = Date.now() - createdTime;

    if (diff >= LIMIT_MS) {
      setEditMessage(null);

      toast.info("Message is too old to edit");
      return;
    }

    const remaining = LIMIT_MS - diff;
    const timer = setTimeout(() => {
      setEditMessage(null);
      setAttachments([]);
      toast.info("Message is too old to edit");
    }, remaining);

    return () => clearTimeout(timer);
  }, [editMessage]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDeleteModal) return;

      const target = event.target as HTMLElement;
      if (target.closest('[id^="message-"]')) return;

      setActiveMessageId(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDeleteModal]);

  const handleClick = (messageId: string) => {
    setActiveMessageId((prev) => (prev === messageId ? null : messageId));
  };

  const handleSendMessage = async (text: string, currentAttachments: Media[]) => {
    if ((!currentChatId && !isVirtual) || (!text.trim() && currentAttachments.length === 0)) {
      debugLog("Send message skipped", {
        currentChatId,
        isVirtual,
        hasText: Boolean(text.trim()),
        attachmentCount: currentAttachments.length,
      });
      return;
    }

    const attachmentIds = currentAttachments.map((att) => att.id);

    let type: MessageType = "text";
    if (currentAttachments.length > 0) {
      const mime = currentAttachments[0].mime_type;
      if (mime.startsWith("image/")) type = "image";
      else if (mime.startsWith("video/")) type = "video";
      else if (mime.startsWith("audio/")) type = "audio";
      else type = "file";
    }

    if (text.trim() && type !== "text") {
      type = "text";
    }

    const targetChatId = createdChatId || currentChatId;
    debugLog("Send message requested", {
      targetChatId,
      isVirtual,
      targetUserId,
      contentLength: text.trim().length,
      attachmentCount: attachmentIds.length,
      replyToId: replyTo?.id ?? null,
      type,
    });

    const payload = {
      content: text.trim(),
      type: type,
      reply_to_id: replyTo ? replyTo.id : undefined,
      attachment_ids: attachmentIds.length > 0 ? attachmentIds : undefined,
    };

    const onSuccess = () => {
      setNewMessageText("");
      setReplyTo(null);
      setAttachments([]);
      setAttachmentMode(false);

      scrollToBottom();
    };

    if (isVirtual && !targetChatId && targetUserId) {
      createPrivateChat(
        { target_user_id: targetUserId },
        {
          onSuccess: (newChat) => {
            debugLog("Private chat created", { newChatId: newChat.id, targetUserId });
            setCreatedChatId(newChat.id);

            sendMessage(
              { ...payload, chat_id: newChat.id },
              {
                onSuccess: () => {
                  debugLog("Message sent after chat creation", { newChatId: newChat.id });
                  setCreatedChatId(null);
                  onSuccess();
                  navigate(`/chat/${newChat.id}`, { replace: true });
                },
                onError: (error) => {
                  debugLog("Send message failed after chat creation", error);
                  toast.error("Failed to send message");
                },
              }
            );
          },
          onError: (error) => {
            debugLog("Create private chat failed", error);
            toast.error("Failed to create chat");
          },
        }
      );
    } else if (targetChatId) {
      sendMessage(
        { ...payload, chat_id: targetChatId },
        {
          onSuccess: () => {
            if (createdChatId) {
              setCreatedChatId(null);
              navigate(`/chat/${targetChatId}`, { replace: true });
            }
            debugLog("Message sent", { chatId: targetChatId });
            onSuccess();
          },
          onError: (error) => {
            debugLog("Send message failed", error);
            toast.error("Failed to send message");
          },
        }
      );
    }
  };

  const handleDeleteMessage = (id: string) => {
    if (!currentChatId) return;
    debugLog("Delete message requested", { messageId: id, chatId: currentChatId });
    setIsDeleteSubmitting(true);
    deleteMessageMutation(
      { messageId: id, chatId: currentChatId },
      {
        onSuccess: () => {
          debugLog("Delete message success", { messageId: id, chatId: currentChatId });
          toast.success("Message deleted");
          setShowDeleteModal(false);
          setMessageToDelete(null);
          setIsDeleteSubmitting(false);
        },
        onError: (error) => {
          debugLog("Delete message failed", error);
          toast.error("Failed to delete message");
          setIsDeleteSubmitting(false);
        },
      }
    );
  };

  const handleEditMessage = async (text: string, currentAttachments: Media[]) => {
    if (!editMessage || !currentChatId) return;
    debugLog("Edit message requested", {
      messageId: editMessage?.id,
      chatId: currentChatId,
      contentLength: text.trim().length,
      attachmentCount: currentAttachments.length,
    });

    if (!text.trim() && currentAttachments.length === 0) {
      debugLog("Edit message skipped: empty content and no attachments", {
        messageId: editMessage.id,
      });
      return;
    }

    const payload: EditMessageRequest = {
      content: text.trim(),
      attachment_ids: currentAttachments.map((a) => a.id),
    };

    if (
      editMessage.content === payload.content &&
      JSON.stringify(editMessage.attachments?.map((a) => a.id)) ===
        JSON.stringify(payload.attachment_ids)
    ) {
      debugLog("Edit message skipped: no effective changes", { messageId: editMessage.id });
      setEditMessage(null);
      setNewMessageText("");
      setAttachments([]);
      return;
    }

    try {
      await editMessageMutation({
        messageId: editMessage.id,
        chatId: currentChatId,
        data: payload,
        optimisticAttachments: [],
      });

      setEditMessage(null);
      setNewMessageText("");
      setAttachments([]);
      setAttachmentMode(false);
      debugLog("Edit message success", { messageId: editMessage.id, chatId: currentChatId });
    } catch (error) {
      debugLog("Edit message failed", error);
      toast.error("Failed to edit message");
    }
  };

  return {
    newMessageText,
    setNewMessageText,
    editMessage,
    setEditMessage,
    activeMessageId,
    setActiveMessageId,
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
    markAsRead,
  };
};
