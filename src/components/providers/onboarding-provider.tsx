import { useAuthStore } from "@/store";
import { createContext, useContext, useState, type ReactNode } from "react";

const OnboardingContext = createContext<{ pending: boolean; settle: (active: boolean) => void }>({
  pending: false,
  settle: () => {},
});
export const useOnboarding = () => useContext(OnboardingContext);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const userId = useAuthStore((state) => state.user?.id);
  const [active, setActive] = useState(false);
  const [settledUser, setSettledUser] = useState<string>();
  let unseen = false;
  try {
    unseen = !!userId && !localStorage.getItem(`atoitalk:onboarding:${userId}`);
  } catch {
    // storage unavailable do not block notification settings
  }
  return (
    <OnboardingContext.Provider
      value={{
        pending: active || (unseen && settledUser !== userId),
        settle: (running) => {
          setActive(running);
          if (!running) setSettledUser(userId);
        },
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
