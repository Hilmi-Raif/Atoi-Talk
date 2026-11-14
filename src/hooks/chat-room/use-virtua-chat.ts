import { formatMessageDateLabel } from "@/lib/date-utils";
import { Message } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VListHandle } from "virtua";

export type ChatItem =
  | { type: "date-separator"; date: string; id: string }
  | { type: "message"; message: Message; date: string; id: string }
  | { type: "loader"; id: string }
  | { type: "error"; id: string; direction: "up" | "down" };

interface UseVirtuaChatProps {
  messages: Message[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  isErrorNextPage: boolean;
  isErrorPreviousPage: boolean;
  fetchNextPage: () => void;
  fetchPreviousPage: () => void;
  currentChatId: string | null;
  isJumping?: boolean;
  jumpTargetId?: string | null;
  jumpTimestamp?: number | null;
}

const BOTTOM_FOLLOW_THRESHOLD = 260;

export const useVirtuaChat = ({
  messages,
  hasNextPage,
  hasPreviousPage,
  isFetchingNextPage,
  isFetchingPreviousPage,
  isErrorNextPage,
  isErrorPreviousPage,
  fetchNextPage,
  fetchPreviousPage,
  currentChatId,
  isJumping = false,
  jumpTargetId,
  jumpTimestamp,
}: UseVirtuaChatProps) => {
  const virtualizerRef = useRef<VListHandle>(null);
  const [activeStickyDate, setActiveStickyDate] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isReadyToDisplay, setIsReadyToDisplay] = useState(false);

  const [shifting, setShifting] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const bottomFollowTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      bottomFollowTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId));
      bottomFollowTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isJumping) {
      setShifting(isFetchingNextPage);
    } else {
      setShifting(false);
    }
  }, [isFetchingNextPage, isJumping]);

  useEffect(() => {
    setActiveStickyDate(null);
    setIsReadyToDisplay(false);
  }, [currentChatId]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
          a.id.localeCompare(b.id)
      ),
    [messages]
  );

  const items: ChatItem[] = useMemo(() => {
    const result: ChatItem[] = [];

    if (hasNextPage) {
      if (isErrorNextPage) {
        result.push({ type: "error", id: "error-top", direction: "up" });
      } else {
        result.push({ type: "loader", id: "loader-top" });
      }
    }

    sortedMessages.forEach((msg, index) => {
      const date = formatMessageDateLabel(msg.created_at);
      const prevMsg = sortedMessages[index - 1];
      const prevDate = prevMsg ? formatMessageDateLabel(prevMsg.created_at) : null;

      if (date !== prevDate) {
        result.push({ type: "date-separator", date, id: `date-${date}-${msg.id}` });
      }
      result.push({ type: "message", message: msg, date, id: msg.id });
    });

    if (hasPreviousPage) {
      if (isErrorPreviousPage) {
        result.push({ type: "error", id: "error-bottom", direction: "down" });
      } else {
        result.push({ type: "loader", id: "loader-bottom" });
      }
    }

    return result;
  }, [sortedMessages, hasNextPage, hasPreviousPage, isErrorNextPage, isErrorPreviousPage]);

  const fetchedTopCountRef = useRef(-1);
  const fetchedBottomCountRef = useRef(-1);
  const topThresholdArmedRef = useRef(true);
  const blockTopAutoFetchUntilRearmedRef = useRef(false);
  const wasAtBottomRef = useRef(true);
  const bottomLockUntilRef = useRef(0);
  const bottomAlignGenerationRef = useRef(0);
  const bottomScrollInputRef = useRef(false);

  useEffect(() => {
    const handleScrollInput = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".chat-message-list")) {
        bottomScrollInputRef.current = true;
      }
    };
    document.addEventListener("wheel", handleScrollInput, { passive: true });
    document.addEventListener("touchstart", handleScrollInput, { passive: true });
    document.addEventListener("pointerdown", handleScrollInput, { passive: true });
    document.addEventListener("keydown", handleScrollInput);
    return () => {
      document.removeEventListener("wheel", handleScrollInput);
      document.removeEventListener("touchstart", handleScrollInput);
      document.removeEventListener("pointerdown", handleScrollInput);
      document.removeEventListener("keydown", handleScrollInput);
    };
  }, []);

  useEffect(() => {
    blockTopAutoFetchUntilRearmedRef.current = false;
    topThresholdArmedRef.current = true;
  }, [currentChatId]);

  const itemCount = items.length;
  const topItemId = items.length > 0 ? items[0].id : null;
  useEffect(() => {
    if (fetchedTopCountRef.current !== -1) {
      fetchedTopCountRef.current = -1;
    }
    if (fetchedBottomCountRef.current !== -1) {
      fetchedBottomCountRef.current = -1;
    }

    if (!blockTopAutoFetchUntilRearmedRef.current) return;

    const ref = virtualizerRef.current;
    if (!ref) return;

    const offset = ref.scrollOffset;
    topThresholdArmedRef.current = offset > 200;
  }, [itemCount, topItemId]);

  const isAtBottom = useCallback((offset: number, scrollSize: number, viewportSize: number) => {
    const threshold = Math.max(BOTTOM_FOLLOW_THRESHOLD, Math.round(viewportSize * 0.25));
    return offset >= scrollSize - viewportSize - threshold;
  }, []);

  const isBottomLockActive = useCallback(
    () => Date.now() < bottomLockUntilRef.current,
    [bottomLockUntilRef]
  );

  const syncBottomState = useCallback(
    (offset: number) => {
      const ref = virtualizerRef.current;
      if (!ref) return false;

      const atBottom = isAtBottom(offset, ref.scrollSize, ref.viewportSize);
      const lockActive = !hasPreviousPage && isBottomLockActive();

      if (lockActive) {
        if (atBottom || !bottomScrollInputRef.current) {
          setShowScrollButton(false);
          wasAtBottomRef.current = true;
          return true;
        }
        bottomLockUntilRef.current = 0;
        bottomAlignGenerationRef.current += 1;
        bottomFollowTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId));
        bottomFollowTimeoutsRef.current = [];
      }

      setShowScrollButton(!atBottom || hasPreviousPage);
      wasAtBottomRef.current = atBottom && !hasPreviousPage;
      return atBottom;
    },
    [hasPreviousPage, isAtBottom, isBottomLockActive]
  );

  const scrollToBottom = useCallback(() => {
    const ref = virtualizerRef.current;
    if (!ref || items.length === 0) return;

    if (!hasPreviousPage) {
      bottomLockUntilRef.current = Date.now() + 900;
    }

    wasAtBottomRef.current = !hasPreviousPage;
    bottomScrollInputRef.current = false;
    const generation = ++bottomAlignGenerationRef.current;

    const alignToLatest = () => {
      if (generation !== bottomAlignGenerationRef.current) return;
      const currentRef = virtualizerRef.current;
      if (!currentRef || items.length === 0) return;
      currentRef.scrollToIndex(items.length - 1, { align: "end" });
      currentRef.scrollTo(currentRef.scrollSize);
    };

    alignToLatest();
    requestAnimationFrame(() => {
      alignToLatest();
      requestAnimationFrame(() => {
        alignToLatest();
      });
    });

    bottomFollowTimeoutsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    bottomFollowTimeoutsRef.current = [];

    [120, 260].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        alignToLatest();
      }, delay);
      bottomFollowTimeoutsRef.current.push(timerId);
    });
  }, [items.length, hasPreviousPage]);

  useEffect(() => {
    const ref = virtualizerRef.current;
    if (!ref) return;

    const wasFollowingLatest = wasAtBottomRef.current;

    requestAnimationFrame(() => {
      const atBottom = syncBottomState(ref.scrollOffset);
      const shouldFollowLatest = wasFollowingLatest || (atBottom && !hasPreviousPage);

      if (shouldFollowLatest && !isFetchingNextPage && items.length > 0 && !isJumping) {
        scrollToBottom();
      }
    });
  }, [
    items.length,
    isFetchingNextPage,
    scrollToBottom,
    isJumping,
    hasPreviousPage,
    syncBottomState,
  ]);

  const handleScroll = useCallback(
    (offset: number) => {
      const ref = virtualizerRef.current;
      if (!ref) return;

      const isScrollable = ref.scrollSize > ref.viewportSize + 10;
      if (!isScrollable) {
        setActiveStickyDate(null);
      } else {
        const topIndex = ref.findItemIndex(offset);
        if (topIndex !== -1 && items[topIndex]) {
          const item = items[topIndex];
          if (item.type === "message" || item.type === "date-separator") {
            setActiveStickyDate(item.date);
          } else {
            setActiveStickyDate(null);
          }
        }
      }

      const atBottom = syncBottomState(offset);

      const isNearTop = offset <= 200;
      if (!isNearTop) {
        topThresholdArmedRef.current = true;
        blockTopAutoFetchUntilRearmedRef.current = false;
      }

      const topFetchBlocked =
        blockTopAutoFetchUntilRearmedRef.current && !topThresholdArmedRef.current;

      if (!topFetchBlocked && isNearTop && hasNextPage && !isFetchingNextPage && !isErrorNextPage) {
        if (blockTopAutoFetchUntilRearmedRef.current) {
          topThresholdArmedRef.current = false;
        }
        if (fetchedTopCountRef.current < items.length) {
          fetchedTopCountRef.current = items.length;
          fetchNextPage();
        }
      }

      if (atBottom && hasPreviousPage && !isFetchingPreviousPage && !isErrorPreviousPage) {
        if (fetchedBottomCountRef.current < items.length) {
          fetchedBottomCountRef.current = items.length;
          fetchPreviousPage();
        }
      }
    },
    [
      items,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
      hasPreviousPage,
      isFetchingPreviousPage,
      fetchPreviousPage,
      isErrorNextPage,
      isErrorPreviousPage,
      syncBottomState,
    ]
  );

  const initialScrollDone = useRef<string | null>(null);

  useEffect(() => {
    if (items.length === 0 && currentChatId) {
      initialScrollDone.current = null;
      setIsReadyToDisplay(false);
    }
  }, [items.length, currentChatId]);

  const prevIsJumpingRef = useRef(isJumping);

  useEffect(() => {
    if (isJumping && !prevIsJumpingRef.current) {
      setIsReadyToDisplay(false);
    }

    if (!isJumping && prevIsJumpingRef.current) {
      blockTopAutoFetchUntilRearmedRef.current = true;
      const ref = virtualizerRef.current;
      topThresholdArmedRef.current = !!ref && ref.scrollOffset > 200;
    }

    prevIsJumpingRef.current = isJumping;
  }, [isJumping]);

  useEffect(() => {
    if (
      currentChatId &&
      initialScrollDone.current !== currentChatId &&
      items.length > 0 &&
      virtualizerRef.current &&
      !isJumping
    ) {
      scrollToBottom();
      initialScrollDone.current = currentChatId;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            setIsReadyToDisplay(true);
          }, 100);
        });
      });
    } else if (isJumping && items.length > 0 && currentChatId) {
      if (initialScrollDone.current !== currentChatId) {
        initialScrollDone.current = currentChatId;
      }
    }
  }, [currentChatId, items.length, isJumping, scrollToBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frameId: number | null = null;
    const viewport = window.visualViewport;

    const handleViewportChange = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      frameId = requestAnimationFrame(() => {
        frameId = null;

        const ref = virtualizerRef.current;
        if (!ref) return;

        const wasFollowingLatest = wasAtBottomRef.current;
        syncBottomState(ref.scrollOffset);

        if ((wasFollowingLatest || isBottomLockActive()) && !hasPreviousPage && !isJumping) {
          scrollToBottom();
        }
      });
    };

    window.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [hasPreviousPage, isBottomLockActive, isJumping, scrollToBottom, syncBottomState]);

  const lastSuccessfulJump = useRef<{ id: string; timestamp: number } | null>(null);
  const [internalHighlightedId, setInternalHighlightedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isJumping || !jumpTargetId || items.length === 0 || !virtualizerRef.current) return;

    if (
      lastSuccessfulJump.current &&
      lastSuccessfulJump.current.id === jumpTargetId &&
      lastSuccessfulJump.current.timestamp === (jumpTimestamp || 0)
    ) {
      return;
    }

    const performJump = () => {
      const index = items.findIndex((item) => {
        if (item.type === "message") {
          return item.message.id === jumpTargetId;
        }
        return false;
      });

      if (index !== -1 && virtualizerRef.current) {
        virtualizerRef.current.scrollToIndex(index, { align: "center" });
        lastSuccessfulJump.current = { id: jumpTargetId, timestamp: jumpTimestamp || 0 };
        setInternalHighlightedId(jumpTargetId);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setInternalHighlightedId(null);
        }, 1000);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              setIsReadyToDisplay(true);
            }, 100);
          });
        });
        return true;
      }
      return false;
    };

    if (performJump()) return;

    let attempts = 0;
    const maxAttempts = 10;

    const interval = setInterval(() => {
      attempts++;
      if (performJump() || attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isJumping, jumpTargetId, jumpTimestamp, items]);

  return {
    virtualizerRef,
    items,
    scrollToBottom,
    handleScroll,
    activeStickyDate,
    showScrollButton,
    shifting,
    isReadyToDisplay,
    highlightedMessageId: internalHighlightedId,
    scrollToMessage: (messageId: string) => {
      if (!virtualizerRef.current) return false;
      const index = items.findIndex((item) => {
        if (item.type === "message") {
          return item.message.id === messageId;
        }
        return false;
      });

      if (index !== -1) {
        virtualizerRef.current.scrollToIndex(index, { align: "center" });
        setInternalHighlightedId(messageId);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setInternalHighlightedId(null);
        }, 1000);
        return true;
      }
      return false;
    },
  };
};
