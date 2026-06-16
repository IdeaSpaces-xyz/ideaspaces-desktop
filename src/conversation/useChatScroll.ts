// Chat auto-scroll — transplanted from is_web (`src/conversation/useChatScroll.ts`).
// Sticks to the bottom while streaming/new messages arrive, unless the user has
// scrolled up; exposes a "scroll to latest" affordance. Pure DOM, no app deps.

import { useCallback, useEffect, useRef, useState } from "react";

interface UseChatScrollOptions {
  messageCount: number;
  isStreaming: boolean;
  streamingText?: string;
}

interface UseChatScrollReturn {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  showScrollButton: boolean;
  scrollToBottom: () => void;
}

const IS_TOUCH = typeof window !== "undefined" && "ontouchstart" in window;
const SCROLL_UP_THRESHOLD = IS_TOUCH ? 40 : 15;
const AT_BOTTOM_THRESHOLD = IS_TOUCH ? 30 : 10;

export function useChatScroll({
  messageCount,
  isStreaming,
  streamingText,
}: UseChatScrollOptions): UseChatScrollReturn {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const userScrolledUp = useRef(false);
  const lastScrollTop = useRef(0);
  const prevMessageCount = useRef(messageCount);
  const lastProgrammaticScroll = useRef(0);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (Date.now() - lastProgrammaticScroll.current < 50) {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollButton(distanceFromBottom > 100);
      lastScrollTop.current = container.scrollTop;
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (scrollTop < lastScrollTop.current - SCROLL_UP_THRESHOLD) {
      userScrolledUp.current = true;
    }

    if (distanceFromBottom < AT_BOTTOM_THRESHOLD) {
      // On touch while streaming, don't immediately re-enable auto-follow from
      // passive position changes (keyboard/address-bar jitter can fake a bottom).
      // Auto-follow re-engages via explicit actions or once streaming stops.
      if (!IS_TOUCH || !isStreamingRef.current) {
        userScrolledUp.current = false;
      }
    }

    lastScrollTop.current = scrollTop;
    setShowScrollButton(distanceFromBottom > 100);
  }, []);

  useEffect(() => {
    if (!isStreaming || userScrolledUp.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    lastProgrammaticScroll.current = Date.now();
    container.scrollTop = container.scrollHeight;
  }, [isStreaming, streamingText]);

  useEffect(() => {
    if (messageCount > prevMessageCount.current && !userScrolledUp.current) {
      const container = scrollContainerRef.current;
      if (container) {
        lastProgrammaticScroll.current = Date.now();
        container.scrollTop = container.scrollHeight;
      }
    }
    prevMessageCount.current = messageCount;
  }, [messageCount]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const scrollToBottom = useCallback(() => {
    userScrolledUp.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return { scrollContainerRef, messagesEndRef, showScrollButton, scrollToBottom };
}
