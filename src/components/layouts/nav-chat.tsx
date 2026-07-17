import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteGroup, useLeaveGroup } from "@/hooks/mutations/use-group";
import { useHideChat } from "@/hooks/mutations/use-hide-chat";
import { getInitials } from "@/lib/avatar-utils";
import { formatChatPreviewDate } from "@/lib/date-utils";
import { getPrivateMessageReceiptState } from "@/lib/read-receipts";
import { cn } from "@/lib/utils";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { ChatListItem } from "@/types";
import {
  Ban,
  Check,
  CheckCheck,
  EllipsisVertical,
  Flag,
  Loader2,
  LogOut,
  RefreshCcw,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { MouseEvent, PointerEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ChatPreviewText } from "@/components/chat/chat-preview-text";
import { BlockUserDialog } from "@/components/modals/block-user-dialog";
import { ReportDialog } from "@/components/modals/report-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";

export function NavChat({
  chats,
  activeMenu,
  setActiveMenu,
  isLoading = false,
  isFetchingNextPage,
  hasNextPage,
  isError,
  refetch,
}: {
  chats: ChatListItem[];
  activeMenu: string | null;
  setActiveMenu: (menu: string | null) => void;
  isLoading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  isError?: boolean;
  refetch?: () => void;
}) {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAuthStore((state) => state.user);
  const typingUsers = useChatStore((state) => state.typingUsers);
  const setActiveChatId = useChatStore((state) => state.setActiveChatId);
  const isBusy = useUIStore((state) => state.isBusy);

  const match = location.pathname.match(/\/chat\/([^/]+)/);
  const activeId = match ? match[1] : null;

  const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatListItem | null>(null);

  const { mutate: hideChat, isPending: isHidingChat } = useHideChat();
  const { mutate: leaveGroup, isPending: isLeavingGroup } = useLeaveGroup();
  const { mutate: deleteGroup, isPending: isDeletingGroup } = useDeleteGroup();

  const [userToBlock, setUserToBlock] = useState<string | null>(null);
  const [userToUnblock, setUserToUnblock] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: "group" | "user";
    id: string;
    name: string;
  } | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const handleChatClick = (chat: ChatListItem) => {
    setActiveMenu(null);
    if (!isBusy) {
      navigate(`/chat/${chat.id}`);
    }
  };

  const handleMenuTriggerPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleMenuTriggerClick = (event: MouseEvent<HTMLButtonElement>, menuId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveMenu(activeMenu === menuId ? null : menuId);
  };

  if (isLoading) {
    return <NavChatSkeleton />;
  }

  return (
    <>
      <SidebarGroup className="p-0 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2">
        <SidebarMenu className="gap-0 group-data-[collapsible=icon]:gap-2">
          {chats.length === 0 && isError && (
            <SidebarMenuItem>
              <div className="h-[calc(100vh-250px)] flex flex-col items-center justify-center gap-2 text-center group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:py-0 group-data-[collapsible=icon]:gap-0">
                <div className="space-y-1 group-data-[collapsible=icon]:hidden">
                  <span className="block font-semibold text-sm">Failed to load</span>
                  <p className="text-[10px] text-muted-foreground">Check your connection</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch?.()}
                  className="h-7 text-xs gap-2 mt-1 group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:rounded-full"
                >
                  <RefreshCcw className="size-3.5" />
                  <span className="group-data-[collapsible=icon]:hidden">Retry</span>
                </Button>
              </div>
            </SidebarMenuItem>
          )}

          {chats.map((chat) => {
            const menuId = `chat-${chat.id}`;
            const isDeleted = chat.type === "private" && chat.other_user_is_deleted;
            const displayName = isDeleted ? "Deleted Account" : chat.name;
            const initials = getInitials(displayName);
            const receiptState = getPrivateMessageReceiptState({
              otherLastReadAt: chat.other_last_read_at,
              messageCreatedAt: chat.last_message?.created_at,
              isOtherOnline: chat.is_online,
            });

            return (
              <SidebarMenuItem
                key={chat.id}
                className="border-b border-sidebar-border group-data-[collapsible=icon]:border-none"
              >
                <div
                  className="relative w-full"
                  onMouseEnter={() => setHoveredChatId(chat.id)}
                  onMouseLeave={() => setHoveredChatId(null)}
                >
                  <SidebarMenuButton
                    onClick={() => handleChatClick(chat)}
                    size="lg"
                    isActive={activeId === chat.id}
                    data-state={activeMenu === menuId ? "open" : "closed"}
                    className={cn(
                      "group relative flex items-center rounded-none px-4 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:px-0",
                      "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
                      activeId === chat.id
                        ? "bg-muted font-normal data-[active=true]:font-normal"
                        : "",
                      !(hoveredChatId === chat.id || activeMenu === menuId || isMobile) && "!pr-4",
                      isBusy ? "opacity-50 cursor-not-allowed" : ""
                    )}
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={isDeleted ? undefined : chat.avatar || undefined}
                          alt={displayName}
                        />
                        <AvatarFallback>
                          {chat.type === "group" ? (
                            <Users className="size-4 text-white" />
                          ) : (
                            initials
                          )}
                        </AvatarFallback>
                      </Avatar>

                      {chat.type === "private" && !isDeleted && (
                        <span
                          className={`absolute bottom-0 right-0 z-20 h-2.5 w-2.5 rounded-full border-2 border-background ring-0 ${chat.is_online ? "bg-green-500" : "bg-gray-400"}`}
                        />
                      )}
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight ml-3 min-w-0 group-data-[collapsible=icon]:hidden">
                      <div className="flex justify-between items-center w-full min-w-0">
                        <span className="truncate font-medium flex-1 min-w-0 mr-2">
                          {displayName}
                        </span>
                        <div className="flex items-center gap-1 pr-1 shrink-0">
                          {chat.type !== "group" &&
                            chat.last_message?.sender_id === currentUser?.id &&
                            (receiptState === "read" ? (
                              <CheckCheck className="size-3.5 text-blue-500" />
                            ) : receiptState === "delivered" ? (
                              <CheckCheck className="size-3.5 text-muted-foreground" />
                            ) : (
                              <Check className="size-3.5 text-muted-foreground/70" />
                            ))}
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatChatPreviewDate(chat.last_message?.created_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center min-h-[16px] text-xs text-muted-foreground font-normal min-w-0">
                        {typingUsers[chat.id]?.some((id) => id !== currentUser?.id) ? (
                          <span className="text-muted-foreground italic animate-pulse truncate">
                            {chat.type === "group" ? "Someone is typing..." : "Typing..."}
                          </span>
                        ) : chat.last_message ? (
                          <ChatPreviewText chat={chat} currentUser={currentUser} />
                        ) : (
                          <span className="truncate">No messages</span>
                        )}
                      </div>
                    </div>
                    {chat.unread_count > 0 ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] leading-none text-primary-foreground ml-3 group-data-[collapsible=icon]:hidden">
                        {chat.unread_count}
                      </div>
                    ) : null}
                  </SidebarMenuButton>

                  <DropdownMenu
                    open={activeMenu === menuId}
                    onOpenChange={(open) => {
                      setActiveMenu(open ? menuId : null);
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction
                        onPointerDown={handleMenuTriggerPointerDown}
                        onClick={(event) => handleMenuTriggerClick(event, menuId)}
                        className={cn(
                          "absolute right-2 !top-1/2 -translate-y-1/2 transition-opacity duration-200 hover:bg-transparent group-data-[collapsible=icon]:hidden",
                          hoveredChatId === chat.id || activeMenu === menuId || isMobile
                            ? "opacity-100"
                            : "opacity-0 pointer-events-none"
                        )}
                      >
                        <EllipsisVertical />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-fit rounded-lg"
                      side={isMobile ? "left" : "right"}
                      align={"center"}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setActiveMenu(null);
                          setTimeout(() => setChatToDelete(chat), 100);
                        }}
                        className={cn(
                          chat.type === "group" && chat.my_role === "owner"
                            ? "text-destructive focus:text-destructive"
                            : ""
                        )}
                      >
                        {chat.type === "group" ? (
                          chat.my_role === "owner" ? (
                            <>
                              <Trash2 className="mr-2 size-4" />
                              <span>Delete Group</span>
                            </>
                          ) : (
                            <>
                              <LogOut className="text-muted-foreground mr-2 size-4" />
                              <span>Leave Group</span>
                            </>
                          )
                        ) : (
                          <>
                            <Trash2 className="text-muted-foreground mr-2 size-4" />
                            <span>Delete Chat</span>
                          </>
                        )}
                      </DropdownMenuItem>

                      {chat.type === "group" && chat.my_role === "member" && (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            setActiveMenu(null);
                            setReportTarget({
                              type: "group",
                              id: chat.id,
                              name: chat.name,
                            });
                            setIsReportOpen(true);
                          }}
                        >
                          <Flag className="text-muted-foreground mr-2 size-4" />
                          <span>Report Group</span>
                        </DropdownMenuItem>
                      )}

                      {chat.type === "private" && chat.other_user_id && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setActiveMenu(null);
                              setReportTarget({
                                type: "user",
                                id: chat.other_user_id!,
                                name: chat.name,
                              });
                              setIsReportOpen(true);
                            }}
                          >
                            <Flag className="text-muted-foreground mr-2 size-4" />
                            <span>Report User</span>
                          </DropdownMenuItem>

                          {!chat.other_user_is_deleted &&
                            (chat.is_blocked_by_me ? (
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setActiveMenu(null);
                                  setTimeout(() => setUserToUnblock(chat.other_user_id!), 100);
                                }}
                              >
                                <Unlock className="text-muted-foreground mr-2 size-4" />
                                <span>Unblock User</span>
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setActiveMenu(null);
                                  setTimeout(() => setUserToBlock(chat.other_user_id!), 100);
                                }}
                              >
                                <Ban className="text-muted-foreground mr-2 size-4" />
                                <span>Block User</span>
                              </DropdownMenuItem>
                            ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        {isFetchingNextPage && (
          <div className="h-12 w-full flex items-center justify-center border-t border-sidebar-border group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:border-none">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isFetchingNextPage && hasNextPage && <div className="h-[0.1px] w-full" />}
      </SidebarGroup>

      <ConfirmationDialog
        open={!!chatToDelete}
        onOpenChange={(open) => !open && setChatToDelete(null)}
        title={
          chatToDelete
            ? chatToDelete.type === "group"
              ? chatToDelete.my_role === "owner"
                ? "Delete Group?"
                : "Leave Group?"
              : "Delete Chat"
            : ""
        }
        description={
          chatToDelete
            ? chatToDelete.type === "group"
              ? chatToDelete.my_role === "owner"
                ? `Are you sure you want to delete "${chatToDelete.name}"? This action cannot be undone.`
                : `Are you sure you want to leave "${chatToDelete.name}"?`
              : "Are you sure you want to delete this chat? It will be hidden until a new message is sent."
            : ""
        }
        confirmText={
          chatToDelete
            ? chatToDelete.type === "group"
              ? chatToDelete.my_role === "owner"
                ? "Delete Group"
                : "Leave"
              : "Delete"
            : "Delete"
        }
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (chatToDelete) {
            const chat = chatToDelete;

            if (chat.type === "group") {
              if (chat.my_role === "owner") {
                if (chat.id === activeId) {
                  setActiveChatId(null);
                }
                deleteGroup(
                  { chatId: chat.id, name: chat.name },
                  {
                    onSuccess: () => {
                      setChatToDelete(null);
                      if (chat.id === activeId) {
                        setTimeout(() => {
                          navigate("/");
                        }, 300);
                      }
                    },
                  }
                );
              } else {
                if (chat.id === activeId) {
                  setActiveChatId(null);
                }
                leaveGroup(chat.id, {
                  onSuccess: () => {
                    setChatToDelete(null);
                    if (chat.id === activeId) {
                      setTimeout(() => {
                        navigate("/");
                      }, 300);
                    }
                  },
                });
              }
            } else {
              if (chat.id === activeId) {
                setActiveChatId(null);
                navigate("/");
              }
              hideChat(chat.id, {
                onSettled: () => {
                  setChatToDelete(null);
                },
              });
            }
          }
        }}
        isLoading={isHidingChat || isLeavingGroup || isDeletingGroup}
      />

      {reportTarget && (
        <ReportDialog
          isOpen={isReportOpen}
          onClose={setIsReportOpen}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetName={reportTarget.name}
        />
      )}

      <BlockUserDialog
        open={!!userToBlock || !!userToUnblock}
        onOpenChange={(open) => {
          if (!open) {
            setUserToBlock(null);
            setUserToUnblock(null);
          }
        }}
        userId={userToBlock || userToUnblock || ""}
        action={userToUnblock ? "unblock" : "block"}
      />
    </>
  );
}

function NavChatSkeleton() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {[1, 2, 3, 4, 5].map((i) => (
          <SidebarMenuItem key={i}>
            <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
              <Skeleton className="h-10 w-10 rounded-full group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8" />
              <div className="flex-1 space-y-2 group-data-[collapsible=icon]:hidden">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
