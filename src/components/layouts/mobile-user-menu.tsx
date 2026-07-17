import { DeleteAccountDialog } from "@/components/modals/delete-account-dialog";
import { useTheme } from "@/components/providers/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser, useLogout } from "@/hooks/queries";
import { getInitials } from "@/lib/avatar-utils";
import { queryClient } from "@/lib/query-client";
import { toast } from "@/lib/toast";
import { useUIStore } from "@/store";
import { User } from "@/types";
import {
  AlertTriangle,
  Ban,
  CircleUserRound,
  DoorOpen,
  LayoutDashboard,
  Lock,
  Moon,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BlockedUsersDialog } from "./nav-footer/blocked-users-dialog";
import { ChangeEmailDialog } from "./nav-footer/change-email-dialog";
import { MyProfileDialog } from "./nav-footer/my-profile-dialog";
import { SecurityDialog } from "./nav-footer/security-dialog";

export function MobileUserMenu({ current }: { current: User }) {
  const [openAccount, setOpenAccount] = useState(false);
  const [openSecurity, setOpenSecurity] = useState(false);
  const [openLogout, setOpenLogout] = useState(false);
  const [openChangeEmail, setOpenChangeEmail] = useState(false);
  const [openBlocked, setOpenBlocked] = useState(false);
  const [openDeleteAccount, setOpenDeleteAccount] = useState(false);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);
  const isBusy = useUIStore((state) => state.isBusy);
  const { data: latestUser } = useCurrentUser();
  const logout = useLogout();

  const activeUser = latestUser || current;
  const isDarkTheme =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const nextTheme = isDarkTheme ? "light" : "dark";
  const ThemeIcon = isDarkTheme ? Sun : Moon;
  const themeLabel = isDarkTheme ? "Light mode" : "Dark mode";

  const handleLogout = async () => {
    setGlobalLoading(true, "Logging Out");
    setIsLogoutLoading(true);

    setTimeout(async () => {
      await logout();
      navigate("/login");

      setGlobalLoading(false);
      setIsLogoutLoading(false);
    }, 2000);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isBusy}
            className="inline-flex size-8 items-center justify-center rounded-full border bg-background disabled:pointer-events-none disabled:opacity-50"
          >
            <Avatar className="size-8">
              <AvatarImage src={activeUser.avatar || undefined} alt={activeUser.full_name} />
              <AvatarFallback>{getInitials(activeUser.full_name)}</AvatarFallback>
            </Avatar>
            <span className="sr-only">Account menu</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 rounded-lg" side="bottom" align="end" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setOpenAccount(true)}>
              <CircleUserRound />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTheme(nextTheme)}>
              <ThemeIcon className="h-4 w-4" />
              {themeLabel}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {activeUser.role === "admin" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    const hasCachedData = queryClient.getQueryData(["admin-stats"]);

                    if (!hasCachedData) {
                      setGlobalLoading(true, "Initializing AtoiTalk");
                      setTimeout(() => {
                        navigate("/admin/dashboard");
                      }, 300);
                    } else {
                      setTimeout(() => navigate("/admin/dashboard"), 150);
                    }
                  }}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Admin Dashboard
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setOpenSecurity(true)}>
              <Lock className="h-4 w-4" />
              Security
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenBlocked(true)}>
              <Ban className="h-4 w-4" />
              Blocked Users
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setOpenDeleteAccount(true)}
            >
              <AlertTriangle className="h-4 w-4" />
              Delete Account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenLogout(true)}>
              <DoorOpen />
              Logout
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {openAccount && (
        <MyProfileDialog
          open={openAccount}
          onOpenChange={setOpenAccount}
          user={activeUser}
          onOpenSecurity={() => setOpenSecurity(true)}
          onOpenChangeEmail={() => setOpenChangeEmail(true)}
        />
      )}

      {openChangeEmail && (
        <ChangeEmailDialog
          open={openChangeEmail}
          onOpenChange={setOpenChangeEmail}
          user={activeUser}
        />
      )}

      <SecurityDialog open={openSecurity} onOpenChange={setOpenSecurity} user={activeUser} />

      <BlockedUsersDialog open={openBlocked} onOpenChange={setOpenBlocked} />

      <ConfirmationDialog
        open={openLogout}
        onOpenChange={setOpenLogout}
        title="Logout"
        description="Are you sure you want to logout? You will need to login again to access your account."
        confirmText="Logout"
        onConfirm={handleLogout}
        isLoading={isLogoutLoading}
      />

      <DeleteAccountDialog
        isOpen={openDeleteAccount}
        onClose={setOpenDeleteAccount}
        hasPassword={activeUser.has_password}
        onSuccess={() => {
          toast.success("Account deleted successfully.");
          setOpenDeleteAccount(false);
          setGlobalLoading(true, "Goodbye...");
          setTimeout(() => {
            logout().then(() => {
              navigate("/login");
              setGlobalLoading(false);
            });
          }, 2000);
        }}
      />
    </>
  );
}
