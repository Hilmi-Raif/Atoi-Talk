import { UserProfileDialog } from "@/components/modals/user-profile-dialog";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockCloseProfileModal = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/queries", () => ({
  useCreatePrivateChat: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUserById: () => ({
    data: {
      id: "user-1",
      full_name: "Online User",
      username: "onlineuser",
      avatar: null,
      bio: null,
      is_online: true,
      is_blocked_by_me: false,
      is_blocked_by_other: false,
      is_banned: false,
      last_seen_at: null,
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/store", () => ({
  useAuthStore: () => ({ user: { id: "current-user" } }),
  useUIStore: (selector: (state: unknown) => unknown) =>
    selector({
      profileModal: {
        isOpen: true,
        userId: "user-1",
        config: {},
      },
      closeProfileModal: mockCloseProfileModal,
    }),
}));

vi.mock("@/components/ui/lightbox", () => ({
  GlobalLightbox: () => null,
}));

vi.mock("@/components/modals/report-dialog", () => ({
  ReportDialog: () => null,
}));

vi.mock("@/components/modals/block-user-dialog", () => ({
  BlockUserDialog: () => null,
}));

describe("UserProfileDialog", () => {
  it("shows online status without a pulsing animation", () => {
    render(<UserProfileDialog />);

    const onlineBadge = screen.getByText("Online").closest("span");

    expect(onlineBadge).toBeInTheDocument();
    expect(onlineBadge?.querySelector(".animate-ping")).not.toBeInTheDocument();
  });
});
