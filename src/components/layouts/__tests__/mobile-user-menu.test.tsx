import { ThemeProvider } from "@/components/providers/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { queryClient } from "@/lib/query-client";
import { toast } from "@/lib/toast";
import { authService, userService } from "@/services";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { User } from "@/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { MobileUserMenu } from "../mobile-user-menu";
import { NavFooter } from "../nav-footer";

vi.mock("@/services", () => ({
  authService: { logout: vi.fn(), deleteAccount: vi.fn() },
  userService: { getCurrentUser: vi.fn(), getBlockedUsers: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn(), debugLog: vi.fn() }));
vi.mock("@/components/auth/captcha", () => ({ Captcha: () => null }));
const user: User = {
  id: "u1",
  email: "person@example.com",
  full_name: "Test Person",
  username: "person",
  avatar: null,
  bio: null,
  has_password: true,
  role: "user",
};

describe.each(["mobile", "sidebar"] as const)("%s account menu", (layout) => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    queryClient.clear();
    useUIStore.getState().reset();
    useAuthStore.getState().setCredentials("session", user);
    vi.mocked(userService.getCurrentUser).mockResolvedValue(user);
    vi.mocked(userService.getBlockedUsers).mockResolvedValue({ data: [], meta: {} } as never);
    vi.mocked(authService.logout).mockResolvedValue(undefined);
    vi.mocked(authService.deleteAccount).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    queryClient.clear();
    useAuthStore.getState().logout();
    useChatStore.getState().reset();
    useUIStore.getState().reset();
    localStorage.removeItem("vite-ui-theme");
  });
  function setup(current = user, theme: "light" | "dark" | "system" = "light") {
    function Menu() {
      const [activeMenu, setActiveMenu] = useState<string | null>(null);
      return layout === "mobile" ? (
        <MobileUserMenu current={current} />
      ) : (
        <NavFooter current={current} activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
      );
    }
    return render(
      <ThemeProvider defaultTheme={theme}>
        <MemoryRouter>
          <SidebarProvider>
            <Routes>
              <Route path="/" element={<Menu />} />
              <Route path="/login" element={<h1>Login destination</h1>} />
              <Route path="/admin/dashboard" element={<h1>Admin destination</h1>} />
            </Routes>
          </SidebarProvider>
        </MemoryRouter>
      </ThemeProvider>,
      { wrapper: context.wrapper }
    );
  }
  async function open() {
    fireEvent.pointerDown(
      screen.getByRole("button", { name: layout === "mobile" ? /Account menu/ : /Test Person/ }),
      {
        button: 0,
        ctrlKey: false,
      }
    );
    return screen.findByRole("menu");
  }

  it.each(layout === "mobile" ? (["light", "dark"] as const) : [])(
    "switches away from the current %s theme",
    async (theme) => {
      setup(user, theme);
      const menu = await open();
      fireEvent.click(
        within(menu).getByRole("menuitem", { name: theme === "light" ? "Dark mode" : "Light mode" })
      );
      expect(document.documentElement).toHaveClass(theme === "light" ? "dark" : "light");
    }
  );

  it("does not offer admin operations to ordinary users", async () => {
    setup();
    expect(
      within(await open()).queryByRole("menuitem", { name: "Admin Dashboard" })
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "navigates an admin to the dashboard (cached stats=%s)",
    async (cached) => {
      const admin = { ...user, role: "admin" as const };
      vi.mocked(userService.getCurrentUser).mockResolvedValue(admin);
      if (cached) queryClient.setQueryData(["admin-stats"], { users: 5 });
      setup(admin);
      fireEvent.click(within(await open()).getByRole("menuitem", { name: "Admin Dashboard" }));
      if (!cached) expect(useUIStore.getState().globalLoading).toBe(true);
      expect(await screen.findByRole("heading", { name: "Admin destination" })).toBeVisible();
    }
  );

  it.each([
    ["Account", "Account Settings"],
    ["Security", "Set Password"],
    ["Blocked Users", "Blocked Users"],
    ["Delete Account", "Delete Account"],
  ])("opens %s as a real dialog", async (label, title) => {
    setup();
    fireEvent.click(within(await open()).getByRole("menuitem", { name: label, exact: true }));
    expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
  });

  it("logs out only after confirmation and clears the session before navigating", async () => {
    setup();
    fireEvent.click(within(await open()).getByRole("menuitem", { name: "Logout" }));
    const dialog = await screen.findByRole("dialog", { name: "Logout" });
    expect(authService.logout).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Logout" }));
    expect(useUIStore.getState().globalLoading).toBe(true);
    expect(
      await screen.findByRole("heading", { name: "Login destination" }, { timeout: 3500 })
    ).toBeVisible();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useUIStore.getState().globalLoading).toBe(false);
  });

  it("deletes a password account and then clears its session", async () => {
    setup();
    fireEvent.click(within(await open()).getByRole("menuitem", { name: "Delete Account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Account" });
    fireEvent.change(within(dialog).getByLabelText("Confirm Password"), {
      target: { value: "StrongPassword1!" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Account" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Account deleted successfully.")
    );
    expect(authService.deleteAccount).toHaveBeenCalledWith({ password: "StrongPassword1!" });
    expect(
      await screen.findByRole("heading", { name: "Login destination" }, { timeout: 3500 })
    ).toBeVisible();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
