import { debugLog, errorLog } from "@/lib/logger";
import { useAuthStore, useChatStore } from "@/store";
import { Message } from "@/types";
import { useCallback, useRef } from "react";
import { useChatEvents } from "./use-chat-events";
import { useConnection } from "./use-connection";
import { useMessageEvents } from "./use-message-events";
import { useTyping } from "./use-typing";
import { useUserEvents } from "./use-user-events";

export const useChatWebSocket = (url: string) => {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);

  const setUserOnline = useChatStore((state) => state.setUserOnline);
  const clearUserTypingGlobal = useChatStore((state) => state.clearUserTypingGlobal);
  const setUserTyping = useChatStore((state) => state.setUserTyping);

  const wsRef = useRef<WebSocket | null>(null);

  const {
    handleUserOnlineStatus,
    handleUserUpdate,
    handleUserBlock,
    handleUserUnblock,
    handleUserBanDelete,
    handleUserUnbanned,
  } = useUserEvents(currentUser, setUserOnline, clearUserTypingGlobal);

  const { handleChatNew, handleChatUpdate, handleChatHide, handleChatDelete, handleChatRead } =
    useChatEvents(currentUser);

  const { handleTypingEvent, sendTyping, clearTypingTimeout } = useTyping(wsRef, currentUser);

  const { handleMessageNew, handleMessageUpdate, handleMessageDelete } = useMessageEvents(
    currentUser,
    clearTypingTimeout,
    setUserTyping
  );

  const onMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        debugLog("WebSocket message:", data);

        switch (data.type) {
          case "message.new":
            handleMessageNew(data.payload as Message);
            break;
          case "message.update":
            handleMessageUpdate(data.payload as Message, data.meta);
            break;
          case "message.delete":
            handleMessageDelete(data);
            break;

          case "chat.new":
            handleChatNew(data.payload);
            break;
          case "chat.update":
            handleChatUpdate(data.payload);
            break;
          case "chat.hide":
            handleChatHide(data.payload);
            break;
          case "chat.delete":
            handleChatDelete(data);
            break;
          case "chat.read":
            handleChatRead(data.payload, data.meta);
            break;
          case "chat.typing":
            handleTypingEvent(data);
            break;

          case "user.online":
            handleUserOnlineStatus(data.payload, true);
            break;
          case "user.offline":
            handleUserOnlineStatus(data.payload, false);
            break;
          case "user.update":
            handleUserUpdate(data.payload);
            break;
          case "user.block":
            handleUserBlock(data.payload);
            break;
          case "user.unblock":
            handleUserUnblock(data.payload);
            break;
          case "user.banned":
          case "user.deleted":
            handleUserBanDelete(data);
            break;
          case "user.unbanned":
            handleUserUnbanned(data);
            break;
        }
      } catch (err) {
        errorLog("WS Error:", err);
      }
    },
    [
      handleMessageNew,
      handleMessageUpdate,
      handleMessageDelete,
      handleChatNew,
      handleChatUpdate,
      handleChatHide,
      handleChatDelete,
      handleChatRead,
      handleTypingEvent,
      handleUserOnlineStatus,
      handleUserUpdate,
      handleUserBlock,
      handleUserUnblock,
      handleUserBanDelete,
      handleUserUnbanned,
    ]
  );

  const onOpen = useCallback(() => {}, []);

  const { isConnected } = useConnection(url, token, onOpen, onMessage, wsRef);

  return { sendTyping, isConnected };
};
