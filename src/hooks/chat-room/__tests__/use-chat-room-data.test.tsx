import { chatService, userService } from "@/services";
import { useAuthStore, useChatStore } from "@/store";
import { ChatListItem, User } from "@/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useChatData } from "../use-chat-room-data";

vi.mock("@/services", () => ({
  chatService: { getChats: vi.fn(), getChatById: vi.fn() },
  userService: { getUserById: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({ debugLog: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const partner: User = {
  id: "u2",
  full_name: "Partner",
  username: "partner",
  email: "partner@example.com",
  avatar: null,
  bio: null,
  has_password: true,
};
const chat = {
  id,
  name: "Partner",
  type: "private",
  other_user_id: "u2",
  last_message: null,
  unread_count: 0,
} as ChatListItem;
let query: ReturnType<typeof createQueryWrapper>;
beforeEach(() => {
  vi.resetAllMocks();
  query = createQueryWrapper();
  useChatStore.getState().reset();
  useAuthStore.getState().logout();
  vi.mocked(chatService.getChats).mockResolvedValue({
    data: [],
    meta: { has_next: false },
  } as never);
  vi.mocked(chatService.getChatById).mockResolvedValue(chat);
  vi.mocked(userService.getUserById).mockResolvedValue(partner);
});
afterEach(() => {
  query.client.clear();
});
function setup(path = `/chat/${id}`, state?: object) {
  const Provider = query.wrapper;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path="/chat/:chatId" element={children} />
          <Route path="/new/:userId" element={children} />
          <Route path="/" element={children} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return renderHook(() => ({ ...useChatData(), location: useLocation() }), { wrapper });
}

describe("useChatData", () => {
  it("loads a private chat and its partner, tracking the active chat until unmount", async () => {
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.partnerProfile).toEqual(partner));
    expect(result.current.chat).toEqual(chat);
    expect(result.current.isVirtual).toBe(false);
    expect(useChatStore.getState().activeChatId).toBe(id);
    unmount();
    expect(useChatStore.getState().activeChatId).toBeNull();
  });

  it("rejects an invalid chat ID without requesting a chat detail", async () => {
    const { result } = setup("/chat/not-a-uuid");
    await waitFor(() => expect(result.current.location.pathname).toBe("/"));
    expect(result.current.currentChatId).toBeNull();
    expect(chatService.getChatById).not.toHaveBeenCalled();
  });

  it("returns to the list only when kicked from the currently open chat", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.chat).toEqual(chat));
    act(() =>
      window.dispatchEvent(new CustomEvent("kicked-from-chat", { detail: { chatId: "other" } }))
    );
    expect(result.current.location.pathname).toBe(`/chat/${id}`);
    act(() =>
      window.dispatchEvent(new CustomEvent("kicked-from-chat", { detail: { chatId: id } }))
    );
    await waitFor(() => expect(result.current.location.pathname).toBe("/"));
    expect(useChatStore.getState().activeChatId).toBeNull();
  });

  it("builds a virtual chat from a profile without creating a conversation", async () => {
    const { result } = setup("/new/u2");
    await waitFor(() => expect(result.current.chat?.id).toBe("virtual"));
    expect(result.current.chat).toMatchObject({
      name: "Partner",
      other_user_id: "u2",
      last_message: null,
      unread_count: 0,
    });
    expect(result.current.isVirtual).toBe(true);
    expect(chatService.getChatById).not.toHaveBeenCalled();
  });

  it("resolves a virtual route to a previously existing private conversation", async () => {
    vi.mocked(chatService.getChats).mockResolvedValue({
      data: [chat],
      meta: { has_next: false },
    } as never);
    const { result } = setup("/new/u2");
    await waitFor(() => expect(result.current.location.pathname).toBe(`/chat/${id}`));
    expect(result.current.isVirtual).toBe(false);
  });

  it("seeds a navigation-supplied profile without replacing a fresher cached profile", async () => {
    const cached = { ...partner, full_name: "Cached name" };
    query.client.setQueryData(["user", "u2"], cached);
    const { result } = setup("/new/u2", { initialUser: { ...partner, full_name: "Older name" } });
    await waitFor(() => expect(result.current.chat?.name).toBe("Cached name"));
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it("uses a navigation profile immediately when no profile is cached", async () => {
    vi.mocked(userService.getUserById).mockReturnValue(new Promise(() => {}));
    const { result } = setup("/new/u2", { initialUser: partner });
    await waitFor(() => expect(result.current.partnerProfile).toEqual(partner));
    expect(query.client.getQueryData(["user", "u2"])).toEqual(partner);
  });

  it("does not fetch a deleted partner or a profile for a group", async () => {
    vi.mocked(chatService.getChatById).mockResolvedValue({ ...chat, other_user_is_deleted: true });
    const { result } = setup();
    await waitFor(() => expect(result.current.chat?.other_user_is_deleted).toBe(true));
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it("keeps group data independent of partner profiles", async () => {
    vi.mocked(chatService.getChatById).mockResolvedValue({
      ...chat,
      type: "group",
      member_count: 3,
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.chat?.type).toBe("group"));
    expect(result.current.partnerId).toBeUndefined();
    expect(userService.getUserById).not.toHaveBeenCalled();
  });
});
