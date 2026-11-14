import { OnboardingLoadingContext } from "@/components/chat/chat-onboarding";
import { useOnboarding } from "@/components/providers/onboarding-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { enablePush } from "@/lib/push";
import { pushConfigured } from "@/lib/push-config";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store";
import { isSupported } from "firebase/messaging";
import { useContext, useEffect, useState } from "react";

const invitationKey = "atoitalk-push-invitation-dismissed";

export function PushOptIn() {
  const isLoading = useContext(OnboardingLoadingContext);
  const { pending } = useOnboarding();
  const token = useAuthStore((state) => state.token);
  const [dismissed, setDismissed] = useState(
    () =>
      localStorage.getItem(invitationKey) === "true" ||
      sessionStorage.getItem(invitationKey) === "true"
  );
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const eligible =
    !!token &&
    !dismissed &&
    pushConfigured() &&
    window.isSecureContext &&
    "Notification" in window &&
    Notification.permission === "default" &&
    localStorage.getItem("atoitalk-push-enabled") !== "true";
  useEffect(() => {
    let active = true;
    if (eligible)
      void isSupported()
        .then((value) => {
          if (active) setSupported(value);
        })
        .catch(() => {
          if (active) setSupported(false);
        });
    return () => {
      active = false;
    };
  }, [eligible]);
  const dismiss = (remember = true) => {
    (remember ? localStorage : sessionStorage).setItem(invitationKey, "true");
    setDismissed(true);
  };
  if (!eligible || !supported || isLoading || pending) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) dismiss(false);
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Enable notifications?</DialogTitle>
          <DialogDescription>Get notified about new messages on this device.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => dismiss()}>
            Later
          </Button>
          <Button
            className="relative"
            disabled={busy}
            aria-busy={busy}
            onClick={() => {
              localStorage.setItem(invitationKey, "true");
              setBusy(true);
              void enablePush(token!)
                .catch((error: unknown) => {
                  toast.error(
                    error instanceof Error ? error.message : "Could not enable notifications."
                  );
                })
                .finally(() => {
                  setBusy(false);
                  dismiss();
                });
            }}
          >
            <span className={busy ? "opacity-0" : ""}>Enable</span>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="size-4" />
              </div>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
