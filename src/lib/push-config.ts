export function pushConfigured(): boolean {
  return (
    import.meta.env.VITE_PUSH_ENABLED === "true" &&
    [
      import.meta.env.VITE_FIREBASE_API_KEY,
      import.meta.env.VITE_FIREBASE_PROJECT_ID,
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      import.meta.env.VITE_FIREBASE_APP_ID,
      import.meta.env.VITE_FIREBASE_VAPID_KEY,
    ].every(Boolean)
  );
}

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function notificationPath(chatId?: string): string {
  return chatId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId)
    ? `/chat/${chatId}`
    : "/chat";
}
