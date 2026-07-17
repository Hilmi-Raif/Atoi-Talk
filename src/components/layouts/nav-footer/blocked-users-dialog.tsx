import { InfiniteList } from "@/components/infinite-list";
import { BlockUserDialog } from "@/components/modals/block-user-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBlockedUsers } from "@/hooks/queries";
import { User } from "@/types";
import { Ban, Search } from "lucide-react";
import { useEffect, useState } from "react";

export function BlockedUsersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [blockedSearch, setBlockedSearch] = useState("");
  const [debouncedBlockedSearch, setDebouncedBlockedSearch] = useState("");
  const [userToUnblock, setUserToUnblock] = useState<string | null>(null);
  const [hasLoadedBlockedUsers, setHasLoadedBlockedUsers] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBlockedSearch(blockedSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [blockedSearch]);

  const trimmedBlockedSearch = debouncedBlockedSearch.trim();
  const {
    data: blockedUsersData,
    isLoading: isLoadingBlocked,
    refetch: refetchBlocked,
    hasNextPage: hasNextBlockedPage,
    fetchNextPage: fetchNextBlockedPage,
    isFetchingNextPage: isFetchingNextBlockedPage,
    isError: isBlockedError,
  } = useBlockedUsers(trimmedBlockedSearch, {
    enabled: open && (!trimmedBlockedSearch || trimmedBlockedSearch.length >= 3),
  });

  const blockedUsers = blockedUsersData?.pages.flatMap((page) => page.data) || [];
  const isSearchDisabled =
    !blockedSearch && (!hasLoadedBlockedUsers || (!isLoadingBlocked && blockedUsers.length === 0));

  useEffect(() => {
    if (open && !isLoadingBlocked) {
      setHasLoadedBlockedUsers(true);
    }
  }, [open, isLoadingBlocked]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(val) => {
          if (!val) {
            setBlockedSearch("");
            setDebouncedBlockedSearch("");
            setHasLoadedBlockedUsers(false);
          }
          onOpenChange(val);
        }}
      >
        <DialogContent
          size="default"
          className="h-[600px] flex flex-col"
          onInteractOutside={(e) => userToUnblock && e.preventDefault()}
          onEscapeKeyDown={(e) => userToUnblock && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Blocked Users</DialogTitle>
            <DialogDescription>Manage users you have blocked.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search blocked users..."
                className="pl-8"
                value={blockedSearch}
                onChange={(e) => setBlockedSearch(e.target.value)}
                disabled={isSearchDisabled}
                maxLength={100}
              />
            </div>
            <div className="flex-1 overflow-hidden">
              <InfiniteList
                items={blockedUsers}
                isLoading={isLoadingBlocked}
                isError={!!isBlockedError}
                hasNextPage={!!hasNextBlockedPage}
                isFetchingNextPage={!!isFetchingNextBlockedPage}
                fetchNextPage={() => fetchNextBlockedPage()}
                refetch={() => refetchBlocked()}
                emptyMessage={
                  trimmedBlockedSearch ? "No users found." : "You haven't blocked any users yet."
                }
                loadingHeight="h-11"
                showBorder={false}
                resetKey={debouncedBlockedSearch}
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
                        className="size-8 transition-all duration-200"
                        onClick={() => setUserToUnblock(user.id)}
                      >
                        <Ban className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <BlockUserDialog
        open={!!userToUnblock}
        onOpenChange={(val) => {
          if (!val) setUserToUnblock(null);
        }}
        userId={userToUnblock}
        action="unblock"
      />
    </>
  );
}
