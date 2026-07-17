import { ModeToggle } from "@/components/mode-toggle.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { ChatListItem, User } from "@/types";
import { ArrowLeft, Users } from "lucide-react";

import { GroupProfileDialog } from "@/components/modals/group-profile-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getInitials } from "@/lib/avatar-utils";
import { formatLastSeen } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ChatHeaderProps {
  chat: ChatListItem;
  partnerId?: string | null;
  partnerProfile?: User | null;
  isProfileError?: boolean;
  isProfileLoading?: boolean;
  onRetryProfile?: () => void;
  isChatLoading?: boolean;
  isChatFetching?: boolean;
  isChatError?: boolean;
  onRetryChat?: () => void;
}

const ChatHeader = ({
  chat,
  partnerId,
  partnerProfile,
  isProfileError,
  isProfileLoading,
  onRetryProfile,
  isChatLoading,
  isChatFetching,
  isChatError,
  onRetryChat,
}: ChatHeaderProps) => {
  const typingUsers = useChatStore((state) => state.typingUsers);
  const { user: currentUser } = useAuthStore();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const isTyping = typingUsers[chat.id]?.some((id) => id !== currentUser?.id);
  const openProfileModal = useUIStore((state) => state.openProfileModal);
  const isBusy = useUIStore((state) => state.isBusy);

  const displayChat = chat;
  const isDeleted = displayChat.type === "private" && displayChat.other_user_is_deleted;
  const displayName = isDeleted ? "Deleted Account" : displayChat.name;

  const [showGroupDialog, setShowGroupDialog] = useState(false);

  useEffect(() => {
    setShowGroupDialog(false);
  }, [chat.id]);

  const initials = getInitials(displayName);
  const hasMemberCount = displayChat.type === "group" && displayChat.member_count != null;
  const isGroupInfoLoading =
    displayChat.type === "group" && (isChatLoading || isChatFetching || !hasMemberCount);

  let statusContent: React.ReactNode = "Messages";
  let statusColor = "text-muted-foreground";

  if (displayChat.type === "private") {
    if (isDeleted) {
      statusContent = "last seen a long time ago";
      statusColor = "text-muted-foreground";
    } else if (isProfileLoading) {
      statusContent = <Skeleton className="h-[13px] w-24 rounded-full" />;
    } else if (isProfileError) {
      statusContent = (
        <span className="flex items-center gap-1">
          <span>Failed to load user data.</span>
          <span
            className="text-blue-500 cursor-pointer hover:text-blue-400 transition-colors font-medium"
            onClick={(e) => {
              e.stopPropagation();
              onRetryProfile?.();
            }}
          >
            Retry
          </span>
        </span>
      );
      statusColor = "text-foreground text-xs";
    } else if (
      partnerProfile?.is_blocked_by_me ||
      partnerProfile?.is_blocked_by_other ||
      partnerProfile?.is_banned ||
      displayChat.other_user_is_banned
    ) {
      statusContent = "Last seen a long time ago";
      statusColor = "text-muted-foreground";
    } else if (isTyping) {
      statusContent = "Typing...";
      statusColor = "text-muted-foreground italic font-medium animate-pulse";
    } else if (partnerProfile?.is_online) {
      statusContent = "Online";
      statusColor = "text-green-500 font-medium";
    } else if (partnerProfile?.last_seen_at) {
      statusContent = formatLastSeen(partnerProfile.last_seen_at);
    } else {
      statusContent = "Offline";
    }
  } else {
    if (isGroupInfoLoading) {
      statusContent = <Skeleton className="h-[13px] w-24 rounded-full" />;
    } else if (isChatError) {
      statusContent = (
        <span className="flex items-center gap-1">
          <span>Failed to load group info.</span>
          <span
            className="text-blue-500 cursor-pointer hover:text-blue-400 transition-colors font-medium"
            onClick={(e) => {
              e.stopPropagation();
              onRetryChat?.();
            }}
          >
            Retry
          </span>
        </span>
      );
      statusColor = "text-foreground text-xs";
    } else if (isTyping) {
      statusContent = "Someone is typing...";
      statusColor = "text-muted-foreground italic font-medium animate-pulse";
    } else {
      statusContent = `${displayChat.member_count} members`;
      statusColor = "text-muted-foreground";
    }
  }

  return (
    <>
      <header className="border-b dark:border-[#212224] border-[#e4e4e7] z-50 bg-background flex h-[63px] shrink-0 items-center gap-2">
        <div className="flex gap-2 px-4 w-full justify-between items-center">
          <div className="flex items-center justify-center gap-2">
            {isMobile ? (
              <Button
                type="button"
                aria-label="Back to chats"
                variant="outline"
                size="icon"
                onClick={() => navigate("/chat")}
                className="mr-1 size-8"
              >
                <ArrowLeft className="size-4" />
              </Button>
            ) : (
              <SidebarTrigger className={`mr-1`} />
            )}

            <div
              className={`flex items-center gap-2 transition-opacity ${
                !isBusy &&
                ((displayChat.type === "private" && partnerProfile && !isDeleted) ||
                  (displayChat.type === "group" && !isGroupInfoLoading && !isChatError))
                  ? "cursor-pointer hover:opacity-80"
                  : "cursor-default opacity-100"
              }`}
              onClick={() => {
                if (isBusy) return;
                if (displayChat.type === "private" && partnerId && partnerProfile && !isDeleted) {
                  openProfileModal(partnerId, { hideMessageButton: true });
                } else if (displayChat.type === "group" && !isGroupInfoLoading && !isChatError) {
                  setShowGroupDialog(true);
                }
              }}
            >
              <Avatar className="size-8">
                {isProfileLoading || isGroupInfoLoading ? (
                  <Skeleton className="size-full rounded-full" />
                ) : (
                  <>
                    <AvatarImage
                      src={isDeleted ? undefined : displayChat.avatar || undefined}
                      className="object-cover"
                    />
                    <AvatarFallback>
                      {displayChat.type === "group" ? (
                        <Users className="size-4 text-white" />
                      ) : (
                        initials
                      )}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                {isProfileLoading || isGroupInfoLoading ? (
                  <Skeleton className="h-[13px] w-32 mb-1" />
                ) : (
                  <span className="truncate font-medium">{displayName}</span>
                )}
                <div className={`truncate text-xs ${statusColor} min-h-[16px] flex items-center`}>
                  {statusContent}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ModeToggle />
          </div>
        </div>
      </header>

      {displayChat.type === "group" && (
        <GroupProfileDialog
          isOpen={showGroupDialog}
          onClose={setShowGroupDialog}
          chat={displayChat}
        />
      )}
    </>
  );
};

export default ChatHeader;
