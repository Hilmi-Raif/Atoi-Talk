import { PushOptIn } from "@/components/push-opt-in";
import { listenForNotificationNavigation } from "@/lib/notification-navigation";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { listenForPush, syncPush } from "@/lib/push";
import { pushConfigured } from "@/lib/push-config";
import { useAuthStore } from "@/store";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export function PushProvider() {
  const navigate = useNavigate();
  useEffect(() => listenForNotificationNavigation(navigate), [navigate]);
  const token = useAuthStore((state) => state.token);
  useEffect(() => {
    useNotificationPreferences.setState({ enabled: true, chats: [], loaded: false });
    if (!token) return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void useNotificationPreferences
          .getState()
          .refresh()
          .catch(() => {});
    };
    refresh();

    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [token]);
  useEffect(() => {
    if (!token || !pushConfigured()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void listenForPush()
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch(() => {});
    const refresh = () => {
      if (document.visibilityState === "visible") void syncPush(token).catch(() => {});
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    const timer = window.setInterval(refresh, 30 * 60 * 1000);
    return () => {
      disposed = true;
      unsubscribe?.();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [token]);
  return <PushOptIn />;
}
