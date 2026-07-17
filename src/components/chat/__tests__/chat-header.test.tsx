import ChatHeader from "@/components/chat/chat-header";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
let mockIsMobile = true;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/store", () => ({
  useAuthStore: () => ({ user: { id: "user-1" } }),
  useChatStore: (selector: (state: { typingUsers: Record<string, string[]> }) => unknown) =>
    selector({ typingUsers: {} }),
  useUIStore: (selector: (state: { isBusy: boolean; openProfileModal: () => void }) => unknown) =>
    selector({ isBusy: false, openProfileModal: vi.fn() }),
}));

describe("ChatHeader", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockIsMobile = true;
  });

  it("uses a back button to return to the mobile chat list", () => {
    render(
      <ChatHeader
        chat={{
          id: "chat-1",
          type: "private",
          name: "Hilmi Raif Avicenna",
          avatar: null,
          unread_count: 0,
          last_message: null,
          other_user_id: "user-2",
          member_count: 2,
        }}
        partnerId="user-2"
        partnerProfile={{
          id: "user-2",
          full_name: "Hilmi Raif Avicenna",
          username: "hilmi",
          email: "hilmi@example.com",
          avatar: null,
          role: "user",
          is_banned: false,
          is_online: true,
          is_blocked_by_me: false,
          is_blocked_by_other: false,
          has_password: true,
          created_at: "2026-07-17T10:00:00.000Z",
          updated_at: "2026-07-17T10:00:00.000Z",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /back to chats/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/chat");
  });
});
