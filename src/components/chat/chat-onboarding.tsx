import { useOnboarding } from "@/components/providers/onboarding-provider";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { createContext, useContext, useEffect, useRef } from "react";

export const OnboardingLoadingContext = createContext(false);

export function ChatOnboarding({ userId }: { userId: string }) {
  const { settle } = useOnboarding();
  const settleRef = useRef(settle);
  settleRef.current = settle;
  const isLoading = useContext(OnboardingLoadingContext);
  useEffect(() => {
    if (isLoading) return;
    const key = `atoitalk:onboarding:${userId}`;
    try {
      if (localStorage.getItem(key)) {
        settleRef.current(false);
        return;
      }
    } catch {
      settleRef.current(false);
      return;
    }
    let tour: ReturnType<typeof driver> | undefined;
    const timer = window.setTimeout(() => {
      const steps = [
        {
          selector: "new-chat",
          title: "New conversation",
          description: "Find someone by name or username to start a chat.",
        },
        {
          selector: "groups",
          title: "Groups",
          description: "Find public groups to join, or create your own group.",
        },
        {
          selector: "chat-search",
          title: "Search chats",
          description: "Find a conversation in your chat list.",
        },
        {
          selector: "account",
          title: "Your account",
          description: "Manage your profile, notifications and account settings here.",
        },
      ].flatMap(({ selector, title, description }) => {
        const element = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
        const target =
          selector === "chat-search" ? element?.querySelector("input") || element : element;
        return target ? [{ element: target, popover: { title, description } }] : [];
      });
      if (!steps.length) {
        settleRef.current(false);
        return;
      }
      try {
        localStorage.setItem(key, "seen");
      } catch {
        settleRef.current(false);
        return;
      }
      tour = driver({
        onDestroyed: () => settleRef.current(false),
        steps,
        popoverClass: "atoitalk-tour",
        stagePadding: 4,
        stageRadius: 6,
        showProgress: true,
        allowClose: true,
        overlayClickBehavior: "none",
        disableActiveInteraction: true,
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        closeBtnLabel: "Skip tour",
      });
      settleRef.current(true);
      tour.drive();
    }, 300);
    return () => {
      window.clearTimeout(timer);
      tour?.destroy();
      settleRef.current(false);
    };
  }, [userId, isLoading]);
  return null;
}
