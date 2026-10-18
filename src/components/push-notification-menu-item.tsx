import { MutedConversations } from "@/components/muted-conversations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { disablePush, enablePush } from "@/lib/push";
import { pushConfigured } from "@/lib/push-config";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store";
import { useEffect, useState } from "react";

export function PushNotificationMenuItem({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(
    localStorage.getItem("atoitalk-push-enabled") === "true"
  );
  const token = useAuthStore((state) => state.token);
  const prefs = useNotificationPreferences();
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update notifications");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (open) void action(prefs.refresh);
    // Refresh once per opening; store updates must not restart the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!token) return null;
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>Manage your notifications.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4 border-b pb-4">
            <div>
              <p className="font-medium">Message notifications</p>
              <p className="text-sm text-muted-foreground">Applies to all your devices.</p>
            </div>
            <input
              aria-label="Message notifications"
              type="checkbox"
              role="switch"
              checked={prefs.enabled}
              disabled={busy || !prefs.loaded}
              onChange={(e) => void action(() => prefs.setGlobal(e.target.checked))}
            />
          </div>
          <section className="space-y-2 border-b pb-4">
            <h3 className="font-medium">This device</h3>
            <p className="text-sm text-muted-foreground">
              {typeof Notification !== "undefined" && Notification.permission === "denied"
                ? "Notifications are blocked. Allow them in your browser’s site settings."
                : deviceEnabled
                  ? "Browser notifications enabled"
                  : "Browser notifications not enabled"}
            </p>
            <Button
              variant="outline"
              className="relative"
              aria-busy={deviceBusy}
              disabled={
                busy ||
                !pushConfigured() ||
                (typeof Notification !== "undefined" &&
                  Notification.permission === "denied" &&
                  !deviceEnabled)
              }
              onClick={() =>
                void action(async () => {
                  localStorage.setItem("atoitalk-push-invitation-dismissed", "true");
                  setDeviceBusy(true);
                  try {
                    await (deviceEnabled ? disablePush(token) : enablePush(token));
                    setDeviceEnabled(!deviceEnabled);
                    toast.success("Device preference updated");
                  } finally {
                    setDeviceBusy(false);
                  }
                })
              }
            >
              <span className={deviceBusy ? "opacity-0" : ""}>
                {deviceEnabled ? "Disable on this device" : "Enable on this device"}
              </span>
              {deviceBusy && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="size-4" />
                </div>
              )}
            </Button>
            {!pushConfigured() && (
              <p className="text-sm text-muted-foreground">
                Push is not configured on this deployment.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h3 className="font-medium">Muted conversations</h3>
            <MutedConversations
              open={open}
              busy={busy}
              onUnmute={async (id) => {
                await action(async () => {
                  await prefs.setMute(id, "off");
                });
              }}
            />
          </section>
        </DialogContent>
      </Dialog>
    </>
  );
}
