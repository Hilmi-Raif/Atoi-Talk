import { useAuthStore, useUIStore } from "@/store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const state = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({
  CHAT_LAYOUT_BREAKPOINT: 1024,
  useIsMobile: () => state.mobile,
}));
vi.mock("@/components/layouts/app-sidebar.tsx", () => ({
  AppSidebar: () => <aside>Chat sidebar</aside>,
}));
vi.mock("@/components/modals/user-profile-dialog", () => ({ UserProfileDialog: () => null }));
vi.mock("@/components/modals/banned-user-dialog", () => ({ BannedUserDialog: () => null }));
vi.mock("@/components/providers/push-provider", () => ({ PushProvider: () => null }));
vi.mock("@/context/websocket-context", () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/loading-screen", () => ({
  LoadingScreen: ({ isLoading, message }: { isLoading: boolean; message: string }) =>
    isLoading ? <div role="status">{message}</div> : null,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/pages/landing", () => ({ default: () => <h1>Landing destination</h1> }));
vi.mock("@/pages/login", () => ({ default: () => <h1>Login destination</h1> }));
vi.mock("@/pages/register", () => ({ default: () => <h1>Register destination</h1> }));
vi.mock("@/pages/forgot-password", () => ({ default: () => <h1>Recovery destination</h1> }));
vi.mock("@/pages/google-callback", () => ({ default: () => <h1>Google destination</h1> }));
vi.mock("@/pages/invite", () => ({ default: () => <h1>Invite destination</h1> }));
vi.mock("@/pages/mobile-chat-list", () => ({ default: () => <h1>Mobile conversations</h1> }));
vi.mock("@/pages/chat-room.tsx", () => ({ default: () => <h1>Conversation destination</h1> }));

describe("application routing and splash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.mobile = false;
    useAuthStore.getState().logout();
    useUIStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAuthStore.getState().logout();
    useUIStore.getState().reset();
    window.history.replaceState({}, "", "/");
  });
  function show(path: string, authenticated = false) {
    window.history.replaceState({}, "", path);
    useAuthStore.setState({ isAuthenticated: authenticated });
    return render(<App />);
  }
  it.each([
    ["/login", "Login"],
    ["/register", "Register"],
    ["/forgot", "Recovery"],
    ["/auth/google/callback", "Google"],
  ])("opens public %s without the splash", (path, heading) => {
    show(path);
    expect(screen.getByRole("heading", { name: `${heading} destination` })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("dismisses the initial landing splash after two seconds", () => {
    show("/");
    expect(screen.getByRole("status")).toHaveTextContent("Initializing AtoiTalk");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Landing destination" })).toBeVisible();
  });
  it.each(["/", "/login", "/register", "/forgot"])(
    "redirects an authenticated %s visitor to desktop chat",
    (path) => {
      show(path, true);
      expect(window.location.pathname).toBe("/chat");
      expect(screen.getByText("Select a chat and start messaging")).toBeVisible();
      expect(screen.getByText("Chat sidebar")).toBeVisible();
    }
  );
  it.each([false, true])("opens direct and virtual conversations on mobile=%s", (mobile) => {
    state.mobile = mobile;
    const view = show("/chat/chat-id", true);
    expect(screen.getByRole("heading", { name: "Conversation destination" })).toBeVisible();
    view.unmount();
    show("/chat/u/user-id", true);
    expect(screen.getByRole("heading", { name: "Conversation destination" })).toBeVisible();
  });
  it("uses the mobile conversation list instead of a desktop sidebar", () => {
    state.mobile = true;
    show("/chat", true);
    expect(screen.getByRole("heading", { name: "Mobile conversations" })).toBeVisible();
    expect(screen.queryByText("Chat sidebar")).not.toBeInTheDocument();
  });
  it("does not offer sidebar collapse in the desktop chat workspace", () => {
    show("/chat", true);
    expect(screen.getByText("Chat sidebar")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Toggle Sidebar" })).not.toBeInTheDocument();
  });
  it("opens invitations without requiring a session", () => {
    show("/invite/public-code");
    expect(screen.getByRole("heading", { name: "Invite destination" })).toBeVisible();
  });
  it("redirects unknown URLs through landing and protects chat", () => {
    const view = show("/not-a-page");
    expect(window.location.pathname).toBe("/");
    view.unmount();
    show("/chat/chat-id");
    expect(window.location.pathname).toBe("/login");
  });
  it("handles unauthorized events and removes the listener on unmount", () => {
    const view = show("/invite/code");
    act(() => window.dispatchEvent(new Event("unauthorized")));
    expect(window.location.pathname).toBe("/login");
    act(() => window.dispatchEvent(new Event("unauthorized")));
    expect(window.location.pathname).toBe("/login");
    view.unmount();
    window.history.replaceState({}, "", "/after-unmount");
    act(() => window.dispatchEvent(new Event("unauthorized")));
    expect(window.location.pathname).toBe("/after-unmount");
  });
  it("prefers the active operation's loading message, with a generic fallback", () => {
    show("/login");
    act(() => useUIStore.setState({ globalLoading: true, loadingMessage: "Saving account" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saving account");
    act(() => useUIStore.setState({ loadingMessage: "" }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    act(() => useUIStore.getState().reset());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("keeps the public login route stable when the browser repeats its history event", () => {
    show("/login");
    fireEvent.popState(window);
    expect(screen.getByRole("heading", { name: "Login destination" })).toBeVisible();
  });
});
