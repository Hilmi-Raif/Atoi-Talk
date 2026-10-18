import { MailPlus, MessageSquare, Search } from "lucide-react";

import { InfiniteList } from "@/components/infinite-list";
import Logo from "@/components/logo.tsx";
import { BlockUserDialog } from "@/components/modals/block-user-dialog";
import { errorLog } from "@/lib/logger";

import { useTheme } from "@/components/providers/theme-provider.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button.tsx";

import { PublicGroupSearchDialog } from "@/components/modals/public-group-search-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";
import { useCreatePrivateChat, useSearchUsers } from "@/hooks/queries";
import { chatService, userService } from "@/services";
import { useUIStore } from "@/store";
import { User } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "sonner";

export function NavHeader() {
  const { theme } = useTheme();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [publicSearchOpen, setPublicSearchOpen] = useState(false);
  const [userToBlock, setUserToBlock] = useState<string | null>(null);
  const navigate = useNavigate();
  const isBusy = useUIStore((state) => state.isBusy);

  useEffect(() => {
    if (open) {
      setCreatingChatId(null);
      setSearch("");
      setDebouncedSearch("");
    }
  }, [open]);

  const trimmedSearch = debouncedSearch.trim();
  const {
    data: searchResults,
    isLoading: isSearching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    refetch,
  } = useSearchUsers(trimmedSearch, {
    enabled: !!trimmedSearch && trimmedSearch.length >= 1,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const [creatingChatId, setCreatingChatId] = useState<string | null>(null);
  const { mutateAsync: createPrivateChat } = useCreatePrivateChat();
  const queryClient = useQueryClient();

  const handleSendMessage = async (user: User) => {
    if (creatingChatId) return;
    setCreatingChatId(user.id);

    try {
      const freshUser = await queryClient.fetchQuery({
        queryKey: ["user", user.id],
        queryFn: () => userService.getUserById(user.id),
        staleTime: 10 * 1000,
      });

      const newChat = await createPrivateChat({ target_user_id: freshUser.id });

      await queryClient.fetchQuery({
        queryKey: ["chat", newChat.id],
        queryFn: () => chatService.getChatById(newChat.id),
        staleTime: 10 * 1000,
      });

      setOpen(false);
      navigate(`/chat/${newChat.id}`, { state: { initialUser: freshUser } });
    } catch (error) {
      errorLog("Failed to create chat", error);
      toast.error("Failed to start conversation");
      setCreatingChatId(null);
    }
  };

  const handleDialogChange = (val: boolean) => {
    if (creatingChatId) return;
    if (val) {
      setSearch("");
      setDebouncedSearch("");
    }
    setOpen(val);
  };

  const users = (searchResults?.pages.flatMap((page) => page.data) || []).filter(
    (u) => !u.is_blocked_by_me
  );

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:!p-0">
            <div className="text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <Logo mode={theme} width={40} height={40} />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium ">AtoiTalk</span>
              <span className="truncate text-xs">Enjoy Your Talk</span>
            </div>
            <Dialog open={open} onOpenChange={handleDialogChange}>
              <DialogTrigger asChild>
                <Button
                  className="size-8 group-data-[collapsible=icon]:hidden"
                  variant="outline"
                  size="icon"
                  disabled={isBusy}
                >
                  <MailPlus className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent
                size="default"
                className="h-[600px] flex flex-col"
                onInteractOutside={(e) => {
                  if (creatingChatId) e.preventDefault();
                }}
                onEscapeKeyDown={(e) => {
                  if (creatingChatId) e.preventDefault();
                }}
              >
                <DialogHeader>
                  <DialogTitle>New Message</DialogTitle>
                </DialogHeader>

                <div className="flex-col gap-4 flex-1 min-h-0 mt-2 flex">
                  <div className="relative shrink-0">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      className="pl-8"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoFocus
                      disabled={!!creatingChatId}
                      maxLength={100}
                    />
                  </div>
                  <div className="flex-1 min-h-0 -mr-6 pr-6">
                    <InfiniteList
                      items={users}
                      isLoading={isSearching}
                      isError={!!isError}
                      hasNextPage={!!hasNextPage}
                      isFetchingNextPage={!!isFetchingNextPage}
                      fetchNextPage={() => fetchNextPage()}
                      refetch={() => refetch()}
                      emptyMessage={debouncedSearch ? "No users found." : "Type to search users."}
                      loadingHeight="h-11"
                      showBorder={false}
                      resetKey={debouncedSearch}
                      skeletonButtonCount={1}
                      renderItem={(user: User) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-2 hover:bg-muted rounded-md transition-colors group gap-2 min-w-0 overflow-hidden"
                        >
                          <div className="flex items-center gap-3 flex-1 w-0 overflow-hidden">
                            <Avatar>
                              <AvatarImage src={user.avatar || undefined} />
                              <AvatarFallback>{user.full_name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col text-left min-w-0 overflow-hidden">
                              <span className="text-sm font-medium truncate">{user.full_name}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                @{user.username}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="icon"
                              variant="outline"
                              className="size-8"
                              onClick={() => handleSendMessage(user)}
                              disabled={!!creatingChatId}
                              title="Send Message"
                            >
                              {creatingChatId === user.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <MessageSquare className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              className="size-8 group-data-[collapsible=icon]:hidden"
              variant="outline"
              size="icon"
              disabled={isBusy}
              onClick={() => setPublicSearchOpen(true)}
              title="Groups"
            >
              <Globe className="size-4" />
            </Button>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
      <BlockUserDialog
        open={!!userToBlock}
        onOpenChange={(val) => {
          if (!val) setUserToBlock(null);
        }}
        userId={userToBlock}
      />
      <PublicGroupSearchDialog isOpen={publicSearchOpen} onClose={setPublicSearchOpen} />
    </>
  );
}
