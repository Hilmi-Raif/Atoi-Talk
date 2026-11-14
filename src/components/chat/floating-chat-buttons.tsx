import { Button } from "@/components/ui/button";
import { ArrowDown, SendToBack } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface FloatingChatButtonsProps {
  showReturnButton?: boolean;
  onReturnJump?: () => void;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

// hold hidden overflow across two frames to stop mobile momentum before scrolling
let momentumStop: Promise<void> | null = null;

const stopMomentum = (): Promise<void> => {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) {
    return Promise.resolve();
  }

  const scrollEl = document.querySelector<HTMLElement>(".chat-message-list");
  if (!scrollEl) return Promise.resolve();
  if (momentumStop) return momentumStop;

  const prevValue = scrollEl.style.overflowY;
  const prevPriority = scrollEl.style.getPropertyPriority("overflow-y");
  scrollEl.style.setProperty("overflow-y", "hidden", "important");
  void scrollEl.offsetHeight;

  momentumStop = new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (prevValue) {
          scrollEl.style.setProperty("overflow-y", prevValue, prevPriority);
        } else {
          scrollEl.style.removeProperty("overflow-y");
        }
        momentumStop = null;
        resolve();
      });
    });
  });
  return momentumStop;
};

export const FloatingChatButtons = ({
  showReturnButton,
  onReturnJump,
  showScrollButton,
  scrollToBottom,
}: FloatingChatButtonsProps) => {
  return (
    <div className="absolute -top-14 right-4 sm:right-6 z-10 flex items-center gap-2 pointer-events-none">
      <AnimatePresence>
        {showReturnButton && onReturnJump && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 10 }}
            className="pointer-events-auto"
          >
            <Button
              size="icon"
              className="h-10 w-10 rounded-full bg-background/95 backdrop-blur-sm text-foreground border border-border/80 shadow-md hover:bg-muted hover:shadow-lg transition-all"
              onPointerDown={stopMomentum}
              onClick={() => stopMomentum().then(onReturnJump)}
            >
              <SendToBack className="size-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScrollButton && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="pointer-events-auto"
          >
            <Button
              size="icon"
              className="h-10 w-10 rounded-full bg-background/95 backdrop-blur-sm text-foreground border border-border/80 shadow-md hover:bg-muted hover:shadow-lg transition-all"
              onPointerDown={stopMomentum}
              onClick={() => stopMomentum().then(scrollToBottom)}
            >
              <ArrowDown className="size-4.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
