import { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatRoom } from "../use-chat-room";

const markAsReadMock = vi.fn();

let queryClient: QueryClient;
let messages: any[] = [];
let chatUnreadCount = 0;
let hasFocusSpy: ReturnType<typeof vi.spyOn>;

const setVisibilityState = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: visibilityState,
  });
};

vi.mock("@/hooks/chat-room/use-chat-room-data", () => ({
  useChatData: () => ({
    queryClient,
    currentChatId: "chat-1",
    targetUserId: null,
    isVirtual: false,
    currentUser: { id: "user-1" },
    activeChatId: "chat-1",
    chat: { id: "chat-1", unread_count: chatUnreadCount },
    isLoadingSingleChat: false,
    isChatError: false,
    refetchChat: vi.fn(),
    isFetchingSingleChat: false,
    chatFailureCount: 0,
    chatError: null,
    partnerId: "user-2",
    partnerProfile: null,
    isProfileError: false,
    isProfileLoading: false,
    isFetchingProfile: false,
    refetchProfile: vi.fn(),
    profileFailureCount: 0,
    profileError: null,
  }),
}));

vi.mock("@/hooks/chat-room/use-chat-room-messages", () => ({
  useChatMessages: () => ({
    messages,
    items: [],
    virtualizerRef: { current: null },
    shifting: false,
    handleScroll: vi.fn(),
    displayedStickyDate: null,
    isStickyDateVisible: false,
    isMessagesLoading: false,
    isMessagesError: false,
    isRefetching: false,
    refetchMessages: vi.fn(),
    isJumped: false,
    jumpError: false,
    jumpTargetId: null,
    failedJumpTargetId: null,
    isRemoteJumping: false,
    returnToMessageId: null,
    handleRemoteJump: vi.fn(),
    handleJumpToMessage: vi.fn(),
    handleReturnJump: vi.fn(),
    handleScrollToBottom: vi.fn(),
    showScrollButton: false,
    highlightedMessageId: null,
    handleFetchNextPage: vi.fn(),
    handleFetchPreviousPage: vi.fn(),
    isReadyToDisplay: true,
    returnStack: [],
  }),
}));

vi.mock("@/hooks/chat-room/use-chat-room-actions", () => ({
  useChatActions: () => ({
    newMessageText: "",
    setNewMessageText: vi.fn(),
    editMessage: null,
    setEditMessage: vi.fn(),
    activeMessageId: null,
    replyTo: null,
    setReplyTo: vi.fn(),
    showDeleteModal: false,
    setShowDeleteModal: vi.fn(),
    messageToDelete: null,
    setMessageToDelete: vi.fn(),
    messageRefs: { current: {} },
    attachments: [],
    setAttachments: vi.fn(),
    attachmentMode: false,
    setAttachmentMode: vi.fn(),
    textareaRef: { current: null },
    uploadingFiles: [],
    setUploadingFiles: vi.fn(),
    uploadingKeysRef: { current: new Set() },
    isUploading: false,
    isDeleteSubmitting: false,
    isGlobalBusy: false,
    isSending: false,
    isEditing: false,
    handleClick: vi.fn(),
    handleSendMessage: vi.fn(),
    handleDeleteMessage: vi.fn(),
    handleEditMessage: vi.fn(),
    uploadMedia: vi.fn(),
  }),
}));

vi.mock("@/hooks/mutations/use-mark-read", () => ({
  useMarkAsRead: () => ({ mutate: markAsReadMock }),
}));

const createMessage = (id: string, senderId: string, createdAt: string) => ({
  id,
  chat_id: "chat-1",
  sender_id: senderId,
  sender_name: senderId,
  content: "message",
  type: "text",
  created_at: createdAt,
  attachments: [],
  reply_to: null,
});

describe("useChatRoom", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    messages = [];
    chatUnreadCount = 0;
    markAsReadMock.mockClear();
    hasFocusSpy = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    setVisibilityState("visible");
  });

  afterEach(() => {
    hasFocusSpy.mockRestore();
  });

  it("marks the latest incoming message as read even while chat unread count is stale", async () => {
    chatUnreadCount = 1;
    const { rerender } = renderHook(() => useChatRoom());

    await waitFor(() => {
      expect(markAsReadMock).toHaveBeenCalledTimes(1);
    });

    messages = [createMessage("msg-1", "user-2", "2026-01-01T00:00:00.000Z")];
    rerender();

    await waitFor(() => {
      expect(markAsReadMock).toHaveBeenCalledTimes(2);
    });
    expect(markAsReadMock).toHaveBeenLastCalledWith("chat-1");
  });

  it("does not mark incoming messages as read while the document is not focused", async () => {
    hasFocusSpy.mockReturnValue(false);
    messages = [createMessage("msg-1", "user-2", "2026-01-01T00:00:00.000Z")];

    renderHook(() => useChatRoom());

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(markAsReadMock).not.toHaveBeenCalled();
  });
});
