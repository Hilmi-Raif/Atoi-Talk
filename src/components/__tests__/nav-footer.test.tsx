import { SidebarProvider } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavFooter } from "../layouts/nav-footer";

const { mockSetGlobalLoading, mockToast } = vi.hoisted(() => {
  return {
    mockSetGlobalLoading: vi.fn(),
    mockToast: {
      success: vi.fn(),
      error: vi.fn(),
    },
  };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/store", () => ({
  useUIStore: (selector: any) => selector({ setGlobalLoading: mockSetGlobalLoading }),
}));

vi.mock("@/lib/toast", () => ({
  toast: mockToast,
}));

const mockRefetchUser = vi.fn().mockResolvedValue({ isError: false, data: {} });
const mockUpdateProfile = vi.fn().mockResolvedValue({});
const mockChangePassword = vi.fn();
const mockChangeEmail = vi.fn();
const mockSendOTP = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(true);
const mockRefetchBlocked = vi.fn().mockResolvedValue({ isError: false });

vi.mock("@/hooks/queries", () => ({
  useCurrentUser: () => ({
    data: {
      id: "user1",
      full_name: "Test User",
      username: "testuser",
      email: "test@example.com",
      avatar: null,
      bio: "Test Bio",
      has_password: true,
    },
    refetch: mockRefetchUser,
  }),
  useUpdateProfile: () => ({
    mutateAsync: mockUpdateProfile,
    isPending: false,
  }),
  useChangePassword: () => ({
    mutate: mockChangePassword,
    isPending: false,
  }),
  useChangeEmail: () => ({
    mutate: mockChangeEmail,
    isPending: false,
  }),
  useSendOTP: () => ({
    mutate: mockSendOTP,
    isPending: false,
  }),
  useLogout: () => mockLogout,
  useDeleteAccount: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useBlockedUsers: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: false,
    refetch: mockRefetchBlocked,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    isError: false,
  }),
}));

vi.mock("@/components/auth/captcha", () => ({
  Captcha: ({ onVerify }: any) => {
    return (
      <div data-testid="mock-captcha">
        <button onClick={() => onVerify("mock-captcha-token")} data-testid="captcha-trigger">
          Solve Captcha
        </button>
      </div>
    );
  },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

describe("NavFooter Component", () => {
  const defaultProps = {
    current: {
      id: "user1",
      full_name: "Test User",
      username: "testuser",
      email: "test@example.com",
      avatar: null,
      bio: "Test Bio",
      has_password: true,
      is_online: true,
      last_seen_at: null,
      created_at: "",
      updated_at: "",
    },
    activeMenu: null,
    setActiveMenu: vi.fn(),
  };

  const renderComponent = (props: any = {}) => {
    const queryClient = createTestQueryClient();

    function TestWrapper() {
      const [activeMenu, setActiveMenu] = useState(props.activeMenu || null);
      const handleSetActiveMenu = (menu: string | null) => {
        setActiveMenu(menu);
        if (props.setActiveMenu) props.setActiveMenu(menu);
      };

      return (
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <SidebarProvider>
              <NavFooter
                {...defaultProps}
                {...props}
                activeMenu={activeMenu}
                setActiveMenu={handleSetActiveMenu}
              />
            </SidebarProvider>
          </BrowserRouter>
        </QueryClientProvider>
      );
    }

    return {
      user: userEvent.setup(),
      ...render(<TestWrapper />),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user info correctly", () => {
    renderComponent();
    expect(screen.getByText("Test User")).toBeInTheDocument();
  });

  it("opens account settings and updates profile", async () => {
    const setActiveMenu = vi.fn();
    const { user } = renderComponent({ activeMenu: "footer-menu", setActiveMenu });

    await user.click(screen.getByText("Account"));

    await waitFor(() => expect(screen.getByText("Account Settings")).toBeInTheDocument());

    const nameInput = screen.getByDisplayValue("Test User");
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalled();
    });

    expect(mockUpdateProfile.mock.calls[0][0]).toMatchObject({
      full_name: "Updated Name",
      username: "testuser",
      bio: "Test Bio",
    });
  });

  it("disables profile fields immediately while submit is pending", async () => {
    mockUpdateProfile.mockImplementationOnce(() => new Promise(() => {}));
    const { user } = renderComponent({ activeMenu: "footer-menu" });

    await user.click(screen.getByText("Account"));

    await waitFor(() => expect(screen.getByText("Account Settings")).toBeInTheDocument());

    const nameInput = screen.getByDisplayValue("Test User");
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(nameInput).toBeDisabled();
    });
    expect(mockUpdateProfile).toHaveBeenCalled();
  });

  it("validates empty name in profile settings", async () => {
    const { user } = renderComponent({ activeMenu: "footer-menu" });
    await user.click(screen.getByText("Account"));
    await waitFor(() => expect(screen.getByText("Account Settings")).toBeInTheDocument());

    const nameInput = screen.getByDisplayValue("Test User");
    await user.clear(nameInput);

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    await user.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Name must be at least 3 characters/i)).toBeInTheDocument();
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
