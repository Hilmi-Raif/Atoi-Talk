import { DeleteAccountDialog } from "@/components/modals/delete-account-dialog";
import { useCurrentUser, useLogout } from "@/hooks/queries";
import { queryClient } from "@/lib/query-client";
import { toast } from "@/lib/toast";
import { useUIStore } from "@/store";
import { useNavigate } from "react-router-dom";

import { getInitials } from "@/lib/avatar-utils";
import {
  AlertTriangle,
  Ban,
  ChevronsUpDown,
  CircleUserRound,
  DoorOpen,
  Home,
  LayoutDashboard,
  Lock,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { User } from "@/types";
import { useState } from "react";
import { BlockedUsersDialog } from "./nav-footer/blocked-users-dialog";
import { ChangeEmailDialog } from "./nav-footer/change-email-dialog";
import { MyProfileDialog } from "./nav-footer/my-profile-dialog";
import { SecurityDialog } from "./nav-footer/security-dialog";

export function NavFooter({
  current,
  activeMenu,
  setActiveMenu,
  mode = "app",
}: {
  current: User;
  activeMenu: string | null;
  setActiveMenu: (menu: string | null) => void;
  mode?: "app" | "admin";
}) {
  const [openAccount, setOpenAccount] = useState(false);
  const [openSecurity, setOpenSecurity] = useState(false);
  const [openLogout, setOpenLogout] = useState(false);
  const [openChangeEmail, setOpenChangeEmail] = useState(false);
  const [openBlocked, setOpenBlocked] = useState(false);

  const [openDeleteAccount, setOpenDeleteAccount] = useState(false);

  const navigate = useNavigate();
  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);
  const { setOpenMobile } = useSidebar();
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  const isBusy = useUIStore((state) => state.isBusy);

  const { data: latestUser } = useCurrentUser();
  const logout = useLogout();

  const activeUser = latestUser || current;
  const menuId = "footer-menu";

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
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu
            open={activeMenu === menuId}
            onOpenChange={(open) => setActiveMenu(open ? menuId : null)}
          >
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                disabled={isBusy}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground gap-2"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={activeUser.avatar || undefined} alt={activeUser.full_name} />
                  <AvatarFallback>{getInitials(activeUser.full_name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                  <span className="truncate font-semibold">{activeUser.full_name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    @{activeUser.username}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] w-fit rounded-lg"
              side={"bottom"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setOpenAccount(true);
                    setTimeout(() => setActiveMenu(null), 150);
                  }}
                >
                  <CircleUserRound />
                  Account
                </DropdownMenuItem>
                {mode === "admin" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setOpenMobile(false);
                        setTimeout(() => {
                          navigate("/");
                        }, 300);
                      }}
                    >
                      <Home className="h-4 w-4" />
                      Back to App
                    </DropdownMenuItem>
                  </>
                ) : (
                  activeUser.role === "admin" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          setOpenMobile(false);

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
                    </>
                  )
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onSelect={() => {
                    setActiveMenu(null);
                    setOpenSecurity(true);
                  }}
                >
                  <Lock />
                  Security
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setActiveMenu(null);
                    setOpenBlocked(true);
                  }}
                >
                  <Ban />
                  Blocked Users
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    setActiveMenu(null);
                    setOpenDeleteAccount(true);
                  }}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Delete Account
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setActiveMenu(null);
                  setOpenLogout(true);
                }}
              >
                <DoorOpen />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

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
