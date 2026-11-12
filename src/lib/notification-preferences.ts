import axios from "@/lib/axios";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store";
import { create } from "zustand";

export type ChatMute = {
  chat_id: string;
  name?: string;
  muted_forever: boolean;
  muted_until?: string | null;
};
export function isChatMuted(mute?: ChatMute, now = Date.now()): boolean {
  return Boolean(mute?.muted_forever || (mute?.muted_until && Date.parse(mute.muted_until) > now));
}
type Preferences = {
  enabled: boolean;
  chats: ChatMute[];
  loaded: boolean;
  refresh: () => Promise<void>;
  mergeChats: (chats: ChatMute[]) => void;
  setGlobal: (enabled: boolean) => Promise<void>;
  setMute: (chatID: string, duration: "off" | "forever" | 1 | 8) => Promise<void>;
};
let requestVersion = 0;
export const useNotificationPreferences = create<Preferences>((set, get) => ({
  enabled: true,
  chats: [],
  loaded: false,
  mergeChats: (incoming) =>
    set((state) => ({
      chats: [
        ...state.chats.filter((old) => !incoming.some((m) => m.chat_id === old.chat_id)),
        ...incoming,
      ],
    })),
  refresh: async () => {
    const token = useAuthStore.getState().token;
    const version = ++requestVersion;
    if (!token) return;
    const response = await axios.get("/api/notifications");
    if (useAuthStore.getState().token !== token || version !== requestVersion) return;
    const data = response.data.data;
    set({ enabled: data.message_notifications_enabled, loaded: true });
  },
  setGlobal: async (enabled) => {
    const token = useAuthStore.getState().token;
    await axios.put("/api/notifications", { message_notifications_enabled: enabled });
    if (useAuthStore.getState().token === token) await get().refresh();
  },
  setMute: async (chatID, duration) => {
    const token = useAuthStore.getState().token;
    const mute: ChatMute = {
      chat_id: chatID,
      muted_forever: duration === "forever",
      muted_until:
        typeof duration === "number"
          ? new Date(Date.now() + duration * 3600000).toISOString()
          : null,
    };
    await axios.put(`/api/chats/${chatID}/notifications`, {
      muted_forever: duration === "forever",
      muted_until:
        typeof duration === "number"
          ? new Date(Date.now() + duration * 3600000).toISOString()
          : null,
    });
    if (useAuthStore.getState().token === token) {
      get().mergeChats([mute]);
      void queryClient.invalidateQueries({ queryKey: ["muted-conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    }
  },
}));
