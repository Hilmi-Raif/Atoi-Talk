/// <reference lib="webworker" />
import { initializeApp } from "firebase/app";
import { getMessaging, isSupported, onBackgroundMessage } from "firebase/messaging/sw";
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { firebaseConfig, notificationPath, pushConfigured } from "./lib/push-config";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();
self.skipWaiting();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), { denylist: [/^\/api\//] })
);

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data?.FCM_MSG?.data || event.notification.data;
  if (!data?.chat_id) return;
  event.stopImmediatePropagation();
  event.notification.close();
  const url = new URL(notificationPath(data.chat_id), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin
      ) as WindowClient | undefined;
      if (existing) {
        existing.postMessage({ type: "notification:navigate", chat_id: data.chat_id });
        await existing.focus();
      } else await self.clients.openWindow(url);
    })()
  );
});

if (pushConfigured()) {
  void isSupported().then((supported) => {
    if (supported)
      onBackgroundMessage(getMessaging(initializeApp(firebaseConfig)), () => {
        // FCM displays the server's notification payload; showing it here would duplicate it.
      });
  });
}
