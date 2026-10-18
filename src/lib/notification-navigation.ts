import { notificationPath } from "./push-config";

export function openNotificationChat(chatId?: string) {
  window.dispatchEvent(
    new CustomEvent("notification:navigate", { detail: { path: notificationPath(chatId) } })
  );
}

export function listenForNotificationNavigation(navigate: (path: string) => void) {
  const local = (event: Event) => {
    const path = (event as CustomEvent).detail?.path;
    if (typeof path === "string" && /^\/chat(?:\/[0-9a-f-]{36})?$/i.test(path)) navigate(path);
  };
  const worker = (event: MessageEvent) => {
    if (event.data?.type === "notification:navigate")
      navigate(notificationPath(event.data.chat_id));
  };
  window.addEventListener("notification:navigate", local);
  navigator.serviceWorker?.addEventListener("message", worker);
  return () => {
    window.removeEventListener("notification:navigate", local);
    navigator.serviceWorker?.removeEventListener("message", worker);
  };
}
