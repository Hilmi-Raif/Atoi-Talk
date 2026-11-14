import { OnboardingLoadingContext } from "@/components/chat/chat-onboarding";
import { AppSidebar } from "@/components/layouts/app-sidebar.tsx";
import { BannedUserDialog } from "@/components/modals/banned-user-dialog";
import { UserProfileDialog } from "@/components/modals/user-profile-dialog";
import { ModeToggle } from "@/components/mode-toggle.tsx";
import { OnboardingProvider } from "@/components/providers/onboarding-provider";
import { PushProvider } from "@/components/providers/push-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import ProtectedRoute from "@/components/routes/protected-route";
import PublicRoute from "@/components/routes/public-route";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import { Toaster } from "@/components/ui/sonner";
import { WebSocketProvider } from "@/context/websocket-context";
import { CHAT_LAYOUT_BREAKPOINT, useIsMobile } from "@/hooks/use-mobile";
import ChatRoom from "@/pages/chat-room.tsx";
import ForgotPassword from "@/pages/forgot-password";
import GoogleCallback from "@/pages/google-callback";
import InvitePage from "@/pages/invite";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import MobileChatListPage from "@/pages/mobile-chat-list";
import Register from "@/pages/register";
import { useAuthStore, useUIStore } from "@/store";
import { AnimatePresence } from "motion/react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

const AdminLayout = lazy(() => import("@/layouts/admin-layout"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminUsers = lazy(() => import("@/pages/admin/users"));
const AdminGroups = lazy(() => import("@/pages/admin/groups"));
const AdminReports = lazy(() => import("@/pages/admin/reports"));
const ProtectedAdminRoute = lazy(() => import("@/components/routes/protected-admin-route"));

const EmptyChatState = () => {
  return (
    <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col relative bg-sidebar">
      <header className="absolute top-0 left-0 w-full outline-1 dark:outline-[#212224] outline-[#e4e4e7] z-50 bg-background flex h-[63px] shrink-0 items-center gap-2">
        <div className="flex gap-2 px-4 w-full justify-end items-center">
          <div className="flex items-center gap-2">
            <ModeToggle />
          </div>
        </div>
      </header>
      <div className="flex flex-col items-center justify-center flex-1 w-full p-4">
        <div className="flex justify-center w-full">
          <div className="inline-flex items-center justify-center bg-background border text-foreground rounded-full px-3 py-1 text-xs font-normal">
            Select a chat and start messaging
          </div>
        </div>
      </div>
      <footer className="w-full flex flex-col items-center md:items-end justify-center py-4 px-6 bg-background border-t mt-auto text-center md:text-right">
        <p className="text-sm text-muted-foreground">
          AtoiTalk © {new Date().getFullYear()} All Rights Reserved
        </p>
      </footer>
    </SidebarInset>
  );
};

const AnimatedRoutes = () => {
  const location = useLocation();
  const isFirstRender = useRef(true);
  const isMobile = useIsMobile(CHAT_LAYOUT_BREAKPOINT);

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  const getPageKey = (pathname: string) => {
    if (pathname === "/" || pathname.startsWith("/chat")) {
      return "app-layout";
    }
    if (pathname.startsWith("/admin")) {
      return "admin-layout";
    }
    return pathname;
  };

  const navigate = useNavigate();

  useEffect(() => {
    const handleUnauthorized = () => {
      if (!location.pathname.startsWith("/login")) {
        navigate("/login");
      }
    };

    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, [navigate, location.pathname]);

  return (
    <WebSocketProvider>
      <PushProvider />
      <AnimatePresence mode="wait" initial={true}>
        <Routes location={location} key={getPageKey(location.pathname)}>
          <Route path="/invite/:code" element={<InvitePage />} />

          <Route
            path="/admin/*"
            element={
              <Suspense fallback={null}>
                <ProtectedAdminRoute />
              </Suspense>
            }
          >
            <Route element={<AdminLayout />}>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="groups" element={<AdminGroups />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
            </Route>
          </Route>

          <Route path="/auth/google/callback" element={<GoogleCallback />} />

          <Route
            path="/"
            element={
              useAuthStore.getState().isAuthenticated ? (
                <Navigate to="/chat" replace />
              ) : (
                <Landing />
              )
            }
          />

          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot" element={<ForgotPassword />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route
              path="/chat/*"
              element={
                isMobile ? (
                  <Routes>
                    <Route path="/" element={<MobileChatListPage />} />
                    <Route path=":chatId" element={<ChatRoom />} />
                    <Route path="u/:userId" element={<ChatRoom />} />
                    <Route path="*" element={<Navigate to="/chat" replace />} />
                  </Routes>
                ) : (
                  <div className="chat-workspace-shell">
                    <SidebarProvider
                      open
                      className="chat-workspace"
                      style={
                        { "--sidebar-width": "var(--chat-sidebar-width)" } as React.CSSProperties
                      }
                    >
                      <AppSidebar collapsible="none" className="shrink-0 border-r bg-background" />
                      <Routes>
                        <Route path="/" element={<EmptyChatState />} />
                        <Route path=":chatId" element={<ChatRoom />} />
                        <Route path="u/:userId" element={<ChatRoom />} />
                        <Route path="*" element={<Navigate to="/chat" replace />} />
                      </Routes>
                    </SidebarProvider>
                  </div>
                )
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </WebSocketProvider>
  );
};

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    const path = window.location.pathname;
    const isAuthPage =
      path === "/login" ||
      path === "/register" ||
      path === "/verify" ||
      path === "/forgot" ||
      path === "/auth/google/callback";

    if (isAuthPage && useAuthStore.getState().isAuthenticated) {
      return true;
    }

    return !isAuthPage;
  });

  useEffect(() => {
    if (showSplash) {
      const timer = setTimeout(() => setShowSplash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showSplash]);

  const globalLoading = useUIStore((state) => state.globalLoading);
  const loadingMessage = useUIStore((state) => state.loadingMessage);
  const [loadingVisible, setLoadingVisible] = useState(false);

  return (
    <ThemeProvider>
      <LoadingScreen
        minimumVisibleMs={1000}
        onVisibilityChange={setLoadingVisible}
        isLoading={showSplash || globalLoading}
        message={globalLoading ? loadingMessage || "Loading" : "Initializing AtoiTalk"}
      />
      <OnboardingLoadingContext.Provider value={showSplash || globalLoading || loadingVisible}>
        <OnboardingProvider>
          <Router>
            <UserProfileDialog />
            <BannedUserDialog />
            <AnimatedRoutes />
            <Toaster position="top-center" />
          </Router>
        </OnboardingProvider>
      </OnboardingLoadingContext.Provider>
    </ThemeProvider>
  );
}

export default App;
