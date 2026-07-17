import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button.tsx";
import { ChatListItem, EditMessage, Media, Message, User } from "@/types";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Flag,
  Reply,
  Shield,
  SquarePen,
  Trash2,
} from "lucide-react";

import { ReportDialog } from "@/components/modals/report-dialog";
import { Spinner } from "@/components/ui/spinner.tsx";

import { getPrivateMessageReceiptState } from "@/lib/read-receipts";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { userService } from "@/services";
import { useUIStore } from "@/store";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import * as React from "react";
import { MessageAttachments } from "./message-attachments";
import { MessageReplyPreview } from "./message-reply-preview";

interface MessageBubbleProps {
  message: Message;
  current: User | null;
  chat: ChatListItem | undefined;
  activeMessageId: string | null;
  editMessage: EditMessage | null;
  messageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  isLoadingMessage: boolean;
  isError: boolean;
  handleClick: (messageId: string) => void;
  setEditMessage: (editMessage: EditMessage | null) => void;
  setNewMessageText: (text: string) => void;
  setAttachmentMode: (mode: boolean) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setReplyTo: (message: Message | null) => void;
  setMessageToDelete: (id: string | null) => void;
  setShowDeleteModal: (show: boolean) => void;
  setAttachments: (attachments: Media[]) => void;
  jumpToMessage: (id: string, originId?: string) => void;
  highlightedMessageId: string | null;
  isBusy: boolean;
  isNewMessage?: boolean;
  partnerProfile?: User | null;
}

const MessageBubble = ({
  message,
  current,
  chat,
  activeMessageId,
  editMessage,
  messageRefs,
  isLoadingMessage,
  isError,
  handleClick,
  setEditMessage,
  setNewMessageText,
  setAttachmentMode,
  textareaRef,
  setReplyTo,
  setMessageToDelete,
  setShowDeleteModal,
  setAttachments,
  jumpToMessage,
  highlightedMessageId,
  isBusy,
  isNewMessage = false,
  partnerProfile,
}: MessageBubbleProps) => {
  const isCurrentUser = message.sender_id === current?.id;
  const receiptState = getPrivateMessageReceiptState({
    otherLastReadAt: chat?.other_last_read_at,
    messageCreatedAt: message.created_at,
    isOtherOnline: partnerProfile?.is_online,
    otherLastSeenAt: partnerProfile?.last_seen_at,
  });
  const [isReportOpen, setIsReportOpen] = React.useState(false);

  const handleReply = () => {
    if (editMessage) {
      setEditMessage(null);
      setNewMessageText("");
      setAttachmentMode(false);
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
    }
    setReplyTo(message);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleEdit = () => {
    setAttachments([]);
    setAttachmentMode(false);
    setReplyTo(null);
    setNewMessageText("");
    const editMsg: EditMessage = {
      ...message,
      attachments: message.attachments?.map((att) => ({ ...att, delete: false })) ?? [],
    };
    setEditMessage(editMsg);
    if (message.attachments && message.attachments?.length !== 0) {
      setAttachmentMode(true);
    }
    setNewMessageText(message.content || "");
    if (textareaRef.current) {
      textareaRef.current.value = message.content || "";
      textareaRef.current.focus();
    }
  };

  const queryClient = useQueryClient();
  const setLoadingProfile = useUIStore((state) => state.setLoadingProfile);
  const openProfileModal = useUIStore((state) => state.openProfileModal);

  const handleOpenProfile = async (userId: string) => {
    if (!userId) return;

    setLoadingProfile(true);
    try {
      await queryClient.fetchQuery({
        queryKey: ["user", userId],
        queryFn: () => userService.getUserById(userId),
        staleTime: 0,
      });
      openProfileModal(userId);
    } catch {
      toast.error("Failed to load user profile");
    } finally {
      setLoadingProfile(false);
    }
  };

  const cachedUser =
    !isCurrentUser && chat?.type === "group"
      ? queryClient.getQueryData<User>(["user", message.sender_id])
      : null;

  const effectiveSenderName = cachedUser?.full_name || message.sender_name || "Unknown User";
  const effectiveAvatar = cachedUser?.avatar || message.sender_avatar;

  const senderName = isCurrentUser
    ? "You"
    : chat?.type === "group"
      ? effectiveSenderName
      : chat?.name || "Unknown User";

  const isSenderDeleted =
    !isCurrentUser &&
    ((chat?.type === "private" && chat.other_user_is_deleted) ||
      (!message.sender_id && !message.sender_name));

  const finalSenderName = isSenderDeleted ? "Deleted Account" : senderName;

  const senderAvatar = isCurrentUser
    ? current?.avatar
    : chat?.type === "group"
      ? effectiveAvatar
      : chat?.avatar;

  const isChatBlockedOrDeleted =
    chat?.type === "private" &&
    (chat?.is_blocked_by_me ||
      chat?.is_blocked_by_other ||
      chat?.other_user_is_deleted ||
      chat?.other_user_is_banned ||
      partnerProfile?.is_banned);

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const hasImages = message.attachments?.some((att) => att.mime_type.startsWith("image/"));

  return (
    <>
      <motion.div
        initial={isNewMessage ? { opacity: 0, x: isCurrentUser ? 20 : -20 } : false}
        animate={isNewMessage ? { opacity: 1, x: 0 } : undefined}
        transition={isNewMessage ? { duration: 0.3 } : undefined}
        className={`flex ${isCurrentUser ? "justify-end" : "justify-start"} w-full`}
      >
        <div
          id={`message-${message.id}`}
          ref={(el) => {
            messageRefs.current[message.id] = el;
          }}
          className={cn(
            "group relative flex items-end max-w-[calc(100%-100px)] sm:max-w-[calc(100%-120px)] md:max-w-[60%] lg:max-w-[550px] min-w-0",
            !isCurrentUser && chat?.type === "group" && "gap-2",
            hasImages && "w-[calc(100%-100px)] sm:w-[calc(100%-120px)] md:w-[60%] lg:w-[550px]"
          )}
          onClick={() => handleClick(message.id)}
        >
          {!isCurrentUser && chat?.type === "group" && (
            <Avatar
              className={cn(
                "shrink-0 w-10 h-10 self-end transition-opacity",
                isSenderDeleted || isBusy
                  ? "cursor-default opacity-80"
                  : "cursor-pointer hover:opacity-80"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (isBusy) return;
                if (!isSenderDeleted) handleOpenProfile(message.sender_id);
              }}
            >
              <AvatarImage
                src={isSenderDeleted ? undefined : senderAvatar || undefined}
                className="object-cover w-full h-full"
              />
              <AvatarFallback>{(finalSenderName || "?").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          )}

          {isCurrentUser && (
            <div className="self-stretch shrink-0 h-12 flex h-full items-center justify-center cursor-pointer">
              <div className="flex items-center justify-center min-h-[63.200px]">
                {!isLoadingMessage && !message.deleted_at && (
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 right-full pr-2 flex items-center z-10 transition-all duration-200 ease-in-out",
                      "opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:delay-0",
                      activeMessageId === message.id && "opacity-100 visible"
                    )}
                  >
                    {!isChatBlockedOrDeleted &&
                      Date.now() - new Date(message.created_at).getTime() < 15 * 60 * 1000 && (
                        <Button
                          size={"icon"}
                          disabled={isBusy}
                          className="size-fit p-[6px] bg-foreground border rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit();
                          }}
                        >
                          <SquarePen className="text-background size-4" />
                        </Button>
                      )}

                    <div className="flex flex-col gap-1 items-center">
                      {!isChatBlockedOrDeleted && (
                        <Button
                          size={"icon"}
                          disabled={isBusy}
                          className="size-fit p-[6px] bg-foreground border rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReply();
                          }}
                        >
                          <Reply className="text-background size-4" />
                        </Button>
                      )}
                      <Button
                        size={"icon"}
                        disabled={isBusy}
                        className="size-fit p-[6px] bg-foreground border rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMessageToDelete(message.id);
                          setShowDeleteModal(true);
                        }}
                      >
                        <Trash2 className="text-background size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className={cn(
              "p-[10px] rounded-md border grid gap-1.5 min-w-0 max-w-full overflow-hidden transition-colors duration-200",
              isCurrentUser ? "bg-foreground text-background" : "bg-background text-foreground",
              highlightedMessageId === message.id && "ring-2 ring-blue-500",
              hasImages && "flex-1"
            )}
          >
            {!isCurrentUser && chat?.type === "group" && (
              <div className="flex items-center gap-1.5">
                <p
                  className={cn(
                    "text-sm font-[500] line-clamp-1 transition-opacity text-foreground",
                    isSenderDeleted || isBusy ? "cursor-default" : "cursor-pointer hover:opacity-80"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isBusy) return;
                    if (!isSenderDeleted) handleOpenProfile(message.sender_id);
                  }}
                >
                  {finalSenderName}
                </p>
                {message.sender_role && message.sender_role !== "member" && (
                  <Shield
                    className={cn(
                      "size-3.5 shrink-0",
                      message.sender_role === "owner"
                        ? "text-yellow-500 fill-yellow-500"
                        : "text-blue-500 fill-blue-500"
                    )}
                  />
                )}
              </div>
            )}
            {message.deleted_at ? (
              <p
                className={`text-sm italic flex items-center gap-1 ${isCurrentUser ? "text-background/70" : "text-muted-foreground/80"}`}
              >
                <Ban className="size-3.5 shrink-0" />
                Message deleted
              </p>
            ) : (
              <>
                <MessageReplyPreview
                  message={message}
                  chat={chat}
                  current={current}
                  isCurrentUser={isCurrentUser}
                  jumpToMessage={jumpToMessage}
                />
                <MessageAttachments message={message} isCurrentUser={isCurrentUser} />
                {message.content && (
                  <p className="text-sm whitespace-pre-wrap break-words min-w-0">
                    {message.content.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
                      if (part.match(/(https?:\/\/[^\s]+)/g)) {
                        return (
                          <a
                            key={index}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:opacity-80 text-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {part}
                          </a>
                        );
                      }
                      return part;
                    })}
                  </p>
                )}
              </>
            )}
            <div className="flex justify-end w-full items-center gap-1">
              {message.edited_at && !message.deleted_at && (
                <span
                  className={`text-xs ${isCurrentUser ? "text-background/90" : "text-muted-foreground/90"}`}
                >
                  edited
                </span>
              )}
              <p
                className={`text-xs line text-right ${isCurrentUser ? "text-background" : "text-primary"}`}
              >
                {formattedTime}
              </p>
              {isLoadingMessage ? (
                <Spinner className="size-4" />
              ) : isError ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : null}
              {!isLoadingMessage &&
                !isError &&
                isCurrentUser &&
                !message.deleted_at &&
                chat?.type !== "group" &&
                (receiptState === "read" ? (
                  <CheckCheck className="size-3 text-blue-500" />
                ) : receiptState === "delivered" ? (
                  <CheckCheck className="size-3 text-muted-foreground" />
                ) : (
                  <Check
                    className={`size-3 ${isCurrentUser ? "text-background/70" : "text-muted-foreground"}`}
                  />
                ))}
            </div>
          </div>

          {!isCurrentUser && !message.deleted_at && (
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 left-full pl-2 flex items-center gap-1 z-10 transition-all duration-200 ease-in-out",
                "opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:delay-0",
                activeMessageId === message.id && "opacity-100 visible"
              )}
            >
              <div className="flex flex-col gap-1 items-center">
                <Button
                  size={"icon"}
                  disabled={isBusy}
                  className="size-fit p-[6px] bg-background border rounded-full transition-all duration-200 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setIsReportOpen(true)}
                >
                  <Flag className="text-foreground size-4" />
                </Button>

                {!isChatBlockedOrDeleted && (
                  <Button
                    size={"icon"}
                    disabled={isBusy}
                    className="size-fit p-[6px] bg-background border rounded-full transition-all duration-200 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      if (editMessage) {
                        setEditMessage(null);
                        setNewMessageText("");
                        setAttachmentMode(false);
                        if (textareaRef.current) {
                          textareaRef.current.value = "";
                        }
                      }
                      setReplyTo(message);
                      setTimeout(() => textareaRef.current?.focus(), 0);
                    }}
                  >
                    <Reply className="text-foreground size-4" />
                  </Button>
                )}
              </div>

              {chat?.type === "group" && (chat.my_role === "admin" || chat.my_role === "owner") && (
                <Button
                  size={"icon"}
                  disabled={isBusy}
                  className="size-fit p-[6px] bg-background border rounded-full transition-all duration-200 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    setMessageToDelete(message.id);
                    setShowDeleteModal(true);
                  }}
                >
                  <Trash2 className="text-foreground size-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <ReportDialog
        isOpen={isReportOpen}
        onClose={setIsReportOpen}
        targetType="message"
        targetId={message.id}
        targetName="this message"
      />
    </>
  );
};

export default MessageBubble;
