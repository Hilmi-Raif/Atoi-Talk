import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatWebSocket } from "../websocket/use-chat-ws";

const { createMockStore } = vi.hoisted(() => {
  return {
    createMockStore: (initialState: any) => {
      const store = (selector: any) => (selector ? selector(initialState) : initialState);
      store.getState = () => initialState;
      store.setState = vi.fn();
      store.subscribe = vi.fn();
      return store;
    },
  };
});

vi.mock("@/store", () => {
  return {
    useAuthStore: createMockStore({
      token: "mock-token",
      user: { id: "user1" },
    }),
    useChatStore: createMockStore({
      activeChatId: "chat-1",
      isTyping: {},
      setTyping: vi.fn(),
      setUserTyping: vi.fn(),
      setUserOnline: vi.fn(),
      clearUserTypingGlobal: vi.fn(),
    }),
  };
});

const mockWebSocketInstance = {
  onopen: null as any,
  onclose: null as any,
  onmessage: null as any,
  onerror: null as any,
  send: vi.fn(),
  close: vi.fn(),
  readyState: 0,
};

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string) {
    (MockWebSocket as any).lastUrl = url;
    return mockWebSocketInstance;
  }
}

const getMockWebSocket = () => mockWebSocketInstance;

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

describe("useChatWebSocket Hook", () => {
  let originalWebSocket: any;
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWebSocket = global.WebSocket;
    global.WebSocket = MockWebSocket as any;

    const ws = getMockWebSocket();
    ws.onopen = null;
    ws.onclose = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.send.mockClear();
    ws.close.mockClear();
    ws.readyState = 0;

    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("connects to WebSocket on mount", async () => {
    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });
    expect((MockWebSocket as any).lastUrl).toBe("ws://test.com/?token=mock-token");
  });

  it("handles incoming 'message.new' event", async () => {
    const ws = getMockWebSocket();
    queryClient.setQueryData(["messages", "chat-1"], {
      pages: [{ data: [], next_cursor: null }],
      pageParams: [null],
    });

    const setQueryDataSpy = vi.spyOn(queryClient, "setQueriesData");
    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    const newMessage = {
      type: "message.new",
      payload: {
        id: "msg-123",
        chat_id: "chat-1",
        content: "Hello World",
        sender_id: "other-user",
        created_at: new Date().toISOString(),
      },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(newMessage) } as MessageEvent);
      }
    });

    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["messages", "chat-1"] }),
        expect.any(Function)
      );
    });
  });

  it("refetches chats when incoming message belongs to a chat missing from sidebar cache", async () => {
    const ws = getMockWebSocket();
    queryClient.setQueryData(["chats"], {
      pages: [{ data: [] }],
      pageParams: [null],
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: "message.new",
            payload: {
              id: "msg-new-chat",
              chat_id: "chat-missing",
              content: "First message",
              sender_id: "other-user",
              sender_name: "Other User",
              type: "text",
              created_at: new Date().toISOString(),
              attachments: [],
              reply_to: null,
            },
          }),
        } as MessageEvent);
      }
    });

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["chats"] });
    });
  });

  it("handles 'message.update' (read status) event", async () => {
    const ws = getMockWebSocket();
    const initialMessage = {
      id: "msg-1",
      chat_id: "chat-1",
      sender_id: "user1",
      content: "Hi",
      created_at: "2026-07-17T14:35:00.000Z",
      is_read: false,
    };
    const initialChat = {
      id: "chat-1",
      type: "private",
      last_message: initialMessage,
      other_last_read_at: null,
    };
    queryClient.setQueryData(["messages", "chat-1"], {
      pages: [{ data: [initialMessage], next_cursor: null }],
      pageParams: [null],
    });
    queryClient.setQueryData(["chats"], {
      pages: [{ data: [initialChat] }],
      pageParams: [null],
    });
    queryClient.setQueryData(["chat", "chat-1"], initialChat);

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    const updateEvent = {
      type: "message.update",
      payload: { id: "msg-1", chat_id: "chat-1", is_read: true },
      meta: { timestamp: Date.parse("2026-07-17T14:40:00.000Z") },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(updateEvent) } as MessageEvent);
      }
    });

    await waitFor(() => {
      const data: any = queryClient.getQueryData(["messages", "chat-1"]);
      const msg = data.pages[0].data.find((m: any) => m.id === "msg-1");
      expect(msg.is_read).toBe(true);
      const list: any = queryClient.getQueryData(["chats"]);
      const detail: any = queryClient.getQueryData(["chat", "chat-1"]);
      expect(list.pages[0].data[0].other_last_read_at).toBe("2026-07-17T14:40:00.000Z");
      expect(detail.other_last_read_at).toBe("2026-07-17T14:40:00.000Z");
    });
  });

  it("handles 'message.update' event that clears attachments", async () => {
    const ws = getMockWebSocket();
    const initialMessage = {
      id: "msg-1",
      chat_id: "chat-1",
      content: "With image",
      attachments: [{ id: "att-1", url: "https://example.com/old.png" }],
      created_at: new Date().toISOString(),
    };
    queryClient.setQueryData(["messages", "chat-1"], {
      pages: [{ data: [initialMessage], next_cursor: null }],
      pageParams: [null],
    });
    queryClient.setQueryData(["chats"], {
      pages: [{ data: [{ id: "chat-1", last_message: initialMessage }] }],
      pageParams: [null],
    });

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    const updateEvent = {
      type: "message.update",
      payload: {
        id: "msg-1",
        chat_id: "chat-1",
        content: "Image removed",
        attachments: [],
        edited_at: new Date().toISOString(),
      },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(updateEvent) } as MessageEvent);
      }
    });

    await waitFor(() => {
      const data: any = queryClient.getQueryData(["messages", "chat-1"]);
      const msg = data.pages[0].data.find((m: any) => m.id === "msg-1");
      expect(msg.attachments).toEqual([]);
      expect(msg.content).toBe("Image removed");
    });

    const chats: any = queryClient.getQueryData(["chats"]);
    expect(chats.pages[0].data[0].last_message.attachments).toEqual([]);
  });

  it("handles 'chat.update' event as a full chat snapshot", async () => {
    const ws = getMockWebSocket();
    queryClient.setQueryData(["chats"], {
      pages: [
        {
          data: [
            {
              id: "chat-1",
              type: "group",
              name: "Old Group",
              avatar: null,
              unread_count: 7,
              member_count: 2,
              last_message: null,
              my_role: "member",
            },
          ],
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(["chat", "chat-1"], {
      id: "chat-1",
      type: "group",
      name: "Old Group",
      avatar: null,
      unread_count: 7,
      member_count: 2,
      last_message: null,
      my_role: "member",
    });

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    const updateEvent = {
      type: "chat.update",
      payload: {
        id: "chat-1",
        type: "group",
        name: "New Group",
        avatar: "https://example.com/avatar.png",
        unread_count: 0,
        member_count: 5,
        last_message: null,
        my_role: "admin",
        is_public: true,
      },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(updateEvent) } as MessageEvent);
      }
    });

    await waitFor(() => {
      const data: any = queryClient.getQueryData(["chats"]);
      const chat = data.pages[0].data[0];
      expect(chat.name).toBe("New Group");
      expect(chat.member_count).toBe(5);
      expect(chat.my_role).toBe("admin");
      expect(chat.unread_count).toBe(7);
    });

    const detail: any = queryClient.getQueryData(["chat", "chat-1"]);
    expect(detail.member_count).toBe(5);
    expect(detail.my_role).toBe("admin");
  });

  it("handles 'chat.read' event with the websocket event timestamp", async () => {
    const ws = getMockWebSocket();
    const chat = {
      id: "chat-1",
      type: "private",
      name: "Partner",
      avatar: null,
      unread_count: 0,
      member_count: 2,
      last_message: null,
      other_last_read_at: null,
    };
    queryClient.setQueryData(["chats"], {
      pages: [{ data: [chat] }],
      pageParams: [null],
    });
    queryClient.setQueryData(["chat", "chat-1"], chat);

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: "chat.read",
            payload: { chat_id: "chat-1", user_id: "other-user" },
            meta: { timestamp: Date.parse("2026-07-17T14:40:00.000Z") },
          }),
        } as MessageEvent);
      }
    });

    await waitFor(() => {
      const list: any = queryClient.getQueryData(["chats"]);
      const detail: any = queryClient.getQueryData(["chat", "chat-1"]);
      expect(list.pages[0].data[0].other_last_read_at).toBe("2026-07-17T14:40:00.000Z");
      expect(detail.other_last_read_at).toBe("2026-07-17T14:40:00.000Z");
    });
  });

  it("handles 'user.online' event updates chat list", async () => {
    const ws = getMockWebSocket();
    queryClient.setQueryData(["chats"], {
      pages: [
        {
          data: [{ id: "chat-1", type: "private", other_user_id: "u2", is_online: false }],
        },
      ],
    });

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      if (ws.onopen) ws.onopen({} as any);
    });

    const onlineEvent = {
      type: "user.online",
      payload: { user_id: "u2" },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(onlineEvent) } as MessageEvent);
      }
    });

    await waitFor(() => {
      const data: any = queryClient.getQueryData(["chats"]);
      const chat = data.pages[0].data[0];
      expect(chat.is_online).toBe(true);
    });
  });

  it("handles 'chat.typing' event updates typing state", async () => {
    const ws = getMockWebSocket();
    const { useChatStore } = await import("@/store");
    const mockSetUserTyping = useChatStore((s: any) => s.setUserTyping);

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    const typingEvent = {
      type: "chat.typing",
      meta: { chat_id: "chat-1", sender_id: "other-user" },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(typingEvent) } as MessageEvent);
      }
    });

    await waitFor(() => {
      expect(mockSetUserTyping).toHaveBeenCalledWith("chat-1", "other-user", true);
    });
  });

  it("handles 'message.delete' event marks message as deleted", async () => {
    const ws = getMockWebSocket();
    const initialMessage = {
      id: "msg-to-delete",
      content: "This will be deleted",
      deleted_at: null,
      attachments: [{ id: "a1" }],
      reply_to: null,
    };
    queryClient.setQueryData(["messages"], {
      pages: [{ data: [initialMessage], next_cursor: null }],
      pageParams: [null],
    });

    renderHook(() => useChatWebSocket("ws://test.com"), { wrapper });

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen({} as any);
    });

    const deleteEvent = {
      type: "message.delete",
      payload: { message_id: "msg-to-delete" },
      meta: { timestamp: Date.now() },
    };

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(deleteEvent) } as MessageEvent);
      }
    });

    await waitFor(() => {
      const data: any = queryClient.getQueryData(["messages"]);
      const msg = data.pages[0].data.find((m: any) => m.id === "msg-to-delete");
      expect(msg.deleted_at).not.toBeNull();
      expect(msg.content).toBeNull();
      expect(msg.attachments).toEqual([]);
    });
  });
});
