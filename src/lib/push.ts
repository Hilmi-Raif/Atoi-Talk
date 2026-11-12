import axios from "axios";
import { getApp, getApps, initializeApp } from "firebase/app";
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { openNotificationChat } from "./notification-navigation";
import { isChatMuted, useNotificationPreferences } from "./notification-preferences";
import { firebaseConfig, pushConfigured } from "./push-config";
import { toast } from "./toast";

const installationKey = "atoitalk-push-installation";
const enabledKey = "atoitalk-push-enabled";
let queue = Promise.resolve();

function installation(): { id: string; secret: string } {
  const saved = localStorage.getItem(installationKey);
  if (saved) {
    try {
      const value = JSON.parse(saved);
      if (typeof value.id === "string" && typeof value.secret === "string") return value;
    } catch {
      // replace corrupted installation data
    }
  }
  const value = { id: crypto.randomUUID(), secret: crypto.randomUUID() + crypto.randomUUID() };
  localStorage.setItem(installationKey, JSON.stringify(value));
  return value;
}

async function messaging() {
  if (!pushConfigured() || !window.isSecureContext || !(await isSupported())) {
    throw new Error(
      "Push notifications need a supported browser, localhost or HTTPS, and Firebase configuration."
    );
  }
  return getMessaging(getApps().length ? getApp() : initializeApp(firebaseConfig));
}

type PushProgress = (message: string) => void;

async function bounded<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

async function bind(session: string, signal: AbortSignal, progress?: PushProgress) {
  progress?.("Connecting to browser push service�");
  const sdk = await bounded(messaging(), signal);
  if (!(await bounded(navigator.serviceWorker.getRegistration(), signal))) {
    throw new Error(
      "The notification worker is not active. Build the app, open the preview, and reload once."
    );
  }
  const registration = await bounded(navigator.serviceWorker.ready, signal);
  const token = await bounded(
    getToken(sdk, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    }),
    signal
  );
  if (!token) throw new Error("The browser did not return a push token. Please try again.");
  signal.throwIfAborted();
  progress?.("Registering this device�");
  const device = installation();
  await axios.put(
    `${import.meta.env.VITE_API_BASE_URL}/api/push/devices/${device.id}`,
    {
      token,
      platform: "web",
      device_secret: device.secret,
    },
    { headers: { Authorization: `Bearer ${session}` }, timeout: 15000, signal }
  );
}

export async function enablePush(session: string, progress?: PushProgress): Promise<void> {
  if (!pushConfigured() || !("Notification" in window))
    throw new Error("Push notifications are not configured for this browser.");
  progress?.("Waiting for browser permission�");
  const permissionSignal = AbortSignal.timeout(30000);
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await bounded(Notification.requestPermission(), permissionSignal);
  if (permission !== "granted")
    throw new Error("Allow notifications in your browser's site settings to enable them.");
  await syncPush(session, true, progress);
  localStorage.setItem(enabledKey, "true");
}

export function syncPush(session: string, force = false, progress?: PushProgress): Promise<void> {
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (
        force ||
        (localStorage.getItem(enabledKey) === "true" &&
          "Notification" in window &&
          Notification.permission === "granted")
      ) {
        const controller = new AbortController();
        const timer = setTimeout(
          () =>
            controller.abort(
              new Error(
                "Push activation timed out while connecting to the browser push service. Check your connection and browser push settings, then retry."
              )
            ),
          30000
        );
        try {
          await bounded(bind(session, controller.signal, progress), controller.signal);
        } catch (error) {
          if (error instanceof Error && /retrieving push subscription/i.test(error.message))
            throw new Error(
              "The browser could not connect to its push service. Check your connection and browser push settings, then retry."
            );
          throw error;
        } finally {
          clearTimeout(timer);
        }
      }
    });
  queue = task;
  return task;
}

export function disablePush(session?: string | null): Promise<void> {
  localStorage.removeItem(enabledKey);
  const task = queue
    .catch(() => {})
    .then(async () => {
      const saved = localStorage.getItem(installationKey);
      let unregisterError: unknown;
      if (saved && session && pushConfigured()) {
        try {
          await axios.delete(
            `${import.meta.env.VITE_API_BASE_URL}/api/push/devices/${JSON.parse(saved).id}`,
            {
              headers: { Authorization: `Bearer ${session}` },
              timeout: 10000,
            }
          );
        } catch (error) {
          unregisterError = error;
        }
      }
      if (pushConfigured() && (await isSupported())) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (registration && subscription) {
          const signal = AbortSignal.timeout(20000);
          try {
            const sdk = await bounded(messaging(), signal);
            await bounded(
              getToken(sdk, {
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
                serviceWorkerRegistration: registration,
              }),
              signal
            );
            await bounded(deleteToken(sdk), signal);
          } finally {
            await subscription.unsubscribe();
          }
        }
      }
      if (unregisterError) throw unregisterError;
    });
  queue = task;
  return task;
}

export async function listenForPush(): Promise<() => void> {
  const sdk = await messaging();
  return onMessage(sdk, (payload) => {
    const prefs = useNotificationPreferences.getState();
    if (
      !prefs.loaded ||
      !prefs.enabled ||
      isChatMuted(prefs.chats.find((m) => m.chat_id === payload.data?.chat_id))
    )
      return;
    toast.info(payload.notification?.title || payload.data?.title || "AtoiTalk", {
      description: payload.notification?.body || payload.data?.body || "Ada pesan baru",
      id: payload.data?.event_id || payload.messageId,
      action: {
        label: "Open chat",
        onClick: () => openNotificationChat(payload.data?.chat_id),
      },
    });
  });
}
