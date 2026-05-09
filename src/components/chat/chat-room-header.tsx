import ChatHeader from "@/components/chat/chat-header";
import { ChatHeaderSkeleton } from "@/components/chat/chat-header-skeleton";
import { ChatListItem, User } from "@/types";
import { AxiosError } from "axios";

interface ChatRoomHeaderProps {
  chat: ChatListItem | null;
  partnerId: string | null;
  partnerProfile?: User | null;
  isProfileError: boolean;
  isProfileLoading: boolean;
  isProfileFetching: boolean;
  refetchProfile: () => void;
  isChatLoading: boolean;
  isChatFetching: boolean;
  isChatError: boolean;
  refetchChat: () => void;
  isVirtual: boolean;
  chatFailureCount: number;
  profileFailureCount: number;
  chatError: unknown;
  profileError: unknown;
}

export const ChatRoomHeader = ({
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
  isVirtual,
  chatFailureCount,
  profileFailureCount,
  chatError,
  profileError,
}: ChatRoomHeaderProps) => {
  const isFetchingChat = isChatLoading || isChatFetching;

  const isFetchingVirtualProfile = isVirtual && (isProfileLoading || isProfileFetching);

  const isChat404 = (chatError as AxiosError)?.response?.status === 404;
  const chatFails = chatFailureCount ?? 0;
  const isChatRetrying = chatFails > 0 && chatFails < 4 && !isChat404;

  const isProfile404 = (profileError as AxiosError)?.response?.status === 404;
  const profileFails = profileFailureCount ?? 0;
  const isProfileRetrying = profileFails > 0 && profileFails < 4 && !isProfile404;

  const isInRetryCycle = isChatRetrying || (!!partnerId && isProfileRetrying);

  const showSkeleton =
    (!chat && isFetchingChat) ||
    (isVirtual && !partnerProfile && isFetchingVirtualProfile) ||
    (!chat && isInRetryCycle);

  if (showSkeleton) {
    return <ChatHeaderSkeleton />;
  }

  if (chat) {
    return (
      <ChatHeader
        chat={chat}
        partnerId={partnerId}
        partnerProfile={partnerProfile}
        isProfileError={isProfileError}
        isProfileLoading={isProfileLoading}
        onRetryProfile={refetchProfile}
        isChatLoading={isChatLoading}
        isChatFetching={isChatFetching}
        isChatError={isChatError}
        onRetryChat={refetchChat}
      />
    );
  }

  if (isChatError) {
    return <ChatHeaderSkeleton />;
  }
  return <ChatHeaderSkeleton />;
};
