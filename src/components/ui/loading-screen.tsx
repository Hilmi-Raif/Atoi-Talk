import Logo from "@/components/logo";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface LoadingScreenProps {
  isLoading: boolean;
  message?: string;
  delayMs?: number;
  minimumVisibleMs?: number;
  onVisibilityChange?: (visible: boolean) => void;
}

export const LoadingScreen = ({
  isLoading,
  message,
  delayMs = 0,
  minimumVisibleMs = 0,
  onVisibilityChange,
}: LoadingScreenProps) => {
  const [ready, setReady] = useState(isLoading && delayMs === 0);
  const shownAt = useRef<number | null>(isLoading && delayMs === 0 ? Date.now() : null);
  const lastMessage = useRef(message);
  const visibleMinimum = useRef(minimumVisibleMs);
  if (isLoading) visibleMinimum.current = minimumVisibleMs;
  if (isLoading) lastMessage.current = message;
  useLayoutEffect(() => {
    if (isLoading) {
      if (shownAt.current !== null) return;
      const show = () => {
        shownAt.current = Date.now();
        setReady(true);
      };
      if (delayMs === 0) {
        show();
        return;
      }
      const timer = setTimeout(show, delayMs);
      return () => clearTimeout(timer);
    }
    const remaining =
      shownAt.current === null
        ? 0
        : Math.max(0, visibleMinimum.current - (Date.now() - shownAt.current));
    const hide = () => {
      shownAt.current = null;
      setReady(false);
    };
    if (remaining === 0) {
      hide();
      return;
    }
    const timer = setTimeout(hide, remaining);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs, minimumVisibleMs]);
  useEffect(() => {
    onVisibilityChange?.(ready);
  }, [ready, onVisibilityChange]);
  if (!ready) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <div className="flex items-center justify-center mb-1 text-primary">
            <Logo width={80} height={80} />
          </div>
          <h2 className="text-2xl font-semibold mb-2">Enjoy Your Talk</h2>
          {lastMessage.current && (
            <p className="text-muted-foreground  animate-pulse">{lastMessage.current}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
};
