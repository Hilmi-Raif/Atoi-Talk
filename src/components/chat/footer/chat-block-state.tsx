import { FloatingChatButtons } from "@/components/chat/floating-chat-buttons";
import { Unlock } from "lucide-react";

interface ChatBlockStateProps {
  isDeleted?: boolean;
  isBanned?: boolean;
  isBlockedByMe?: boolean;
  isBlockedByOther?: boolean;
  showReturnButton?: boolean;
  onReturnJump?: () => void;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

export function ChatBlockState({
  isDeleted,
  isBanned,
  isBlockedByMe,
  isBlockedByOther,
  showReturnButton,
  onReturnJump,
  showScrollButton,
  scrollToBottom,
}: ChatBlockStateProps) {
  if (isDeleted) {
    return (
      <footer className="relative mx-auto p-2 gap-2 w-full flex flex-col items-center bg-background border-t">
        <div className="relative w-full max-w-4xl flex flex-col items-start gap-2">
          <FloatingChatButtons
            showReturnButton={showReturnButton}
            onReturnJump={onReturnJump}
            showScrollButton={showScrollButton}
            scrollToBottom={scrollToBottom}
          />
          <div className="flex items-center justify-center gap-2 bg-muted/30 p-2 rounded-xl border shadow-sm w-full min-h-[58px]">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <p className="text-sm text-muted-foreground font-medium">
                This account has been deleted.
              </p>
              <p className="text-[10px] text-muted-foreground">
                You cannot send messages to this user.
              </p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  if (isBanned) {
    return (
      <footer className="relative mx-auto p-2 gap-2 w-full flex flex-col items-center bg-background border-t">
        <div className="relative w-full max-w-4xl flex flex-col items-start gap-2">
          <FloatingChatButtons
            showReturnButton={showReturnButton}
            onReturnJump={onReturnJump}
            showScrollButton={showScrollButton}
            scrollToBottom={scrollToBottom}
          />
          <div className="flex items-center justify-center gap-2 bg-muted/30 p-2 rounded-xl border shadow-sm w-full min-h-[58px]">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <p className="text-sm text-destructive font-medium">This user has been banned.</p>
              <p className="text-[10px] text-muted-foreground">You cannot send messages to them.</p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  if (isBlockedByMe) {
    return (
      <footer className="relative mx-auto p-2 gap-2 w-full flex flex-col items-center bg-background border-t">
        <div className="relative w-full max-w-4xl flex flex-col items-start gap-2">
          <FloatingChatButtons
            showReturnButton={showReturnButton}
            onReturnJump={onReturnJump}
            showScrollButton={showScrollButton}
            scrollToBottom={scrollToBottom}
          />
          <div className="flex items-center justify-center gap-2 bg-muted/30 p-2 rounded-xl border shadow-sm w-full min-h-[58px]">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <p className="text-sm text-muted-foreground font-medium">
                You have blocked this user.
              </p>
              <p className="text-[10px] text-muted-foreground flex items-center">
                Tap the <Unlock className="inline-block w-3 h-3 mx-1" /> icon in the header to
                unblock.
              </p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  if (isBlockedByOther) {
    return (
      <footer className="relative mx-auto p-2 gap-2 w-full flex flex-col items-center bg-background border-t">
        <div className="relative w-full max-w-4xl flex flex-col items-start gap-2">
          <FloatingChatButtons
            showReturnButton={showReturnButton}
            onReturnJump={onReturnJump}
            showScrollButton={showScrollButton}
            scrollToBottom={scrollToBottom}
          />
          <div className="flex items-center justify-center gap-2 bg-muted/30 p-2 rounded-xl border shadow-sm w-full min-h-[58px]">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <p className="text-sm text-muted-foreground font-medium">
                You have been blocked by this user.
              </p>
              <p className="text-[10px] text-muted-foreground">You cannot send messages to them.</p>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return null;
}
