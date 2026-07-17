import { messageService } from "@/services";
import { ChatListItem, Message } from "@/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSendMessage } from "../queries/use-messages";

vi.mock("@/services", () => ({
  messageService: {
    sendMessage: vi.fn(),
  },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("useSendMessage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("keeps chat detail and sidebar last message in sync after sending", async () => {
    const oldMessage: Message = {
      id: "msg-old",
      chat_id: "chat-1",
      sender_id: "user-1",
      sender_name: "Current User",
      content: "old",
      type: "text",
      created_at: "2026-07-17T14:00:00.000Z",
      attachments: [],
      reply_to: null,
    };
    const newMessage: Message = {
      id: "msg-new",
      chat_id: "chat-1",
      sender_id: "user-1",
      sender_name: "Current User",
      content: "new",
      type: "text",
      created_at: "2026-07-17T14:05:00.000Z",
      attachments: [],
      reply_to: null,
    };
    const chat: ChatListItem = {
      id: "chat-1",
      type: "private",
      name: "Partner",
      avatar: null,
      unread_count: 0,
      last_read_at: null,
      other_last_read_at: "2026-07-17T14:04:00.000Z",
      other_user_id: "user-2",
      last_message: oldMessage,
      member_count: 2,
    };

    vi.mocked(messageService.sendMessage).mockResolvedValue(newMessage);

    queryClient.setQueryData(["chat", "chat-1"], chat);
    queryClient.setQueryData(["chats"], {
      pages: [{ data: [chat] }],
      pageParams: [undefined],
    });
    queryClient.setQueryData(["messages", "chat-1"], {
      pages: [{ data: [oldMessage] }],
      pageParams: [undefined],
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ chat_id: "chat-1", type: "text", content: "new" });
    });

    await waitFor(() => {
      const chatDetail = queryClient.getQueryData<ChatListItem>(["chat", "chat-1"]);
      const chatList = queryClient.getQueryData<{ pages: { data: ChatListItem[] }[] }>(["chats"]);

      expect(chatDetail?.last_message?.id).toBe("msg-new");
      expect(chatList?.pages[0].data[0].last_message?.id).toBe("msg-new");
      expect(chatDetail?.other_last_read_at).toBe("2026-07-17T14:04:00.000Z");
      expect(chatList?.pages[0].data[0].other_last_read_at).toBe("2026-07-17T14:04:00.000Z");
    });
  });
});
