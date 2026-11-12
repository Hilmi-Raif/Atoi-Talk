import { InfiniteList } from "@/components/infinite-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useSearchUsers } from "@/hooks/queries";
import { User } from "@/types";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface UserSelectionDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  onConfirm: (users: User[]) => void;
  title?: string;
  existingMemberIds?: string[];
  isSubmitting?: boolean;
  confirmLabel?: string;
  excludeChatId?: string;
}

export function UserSelectionDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Select Users",
  existingMemberIds = [],
  isSubmitting = false,
  confirmLabel = "Add",
  excludeChatId,
}: UserSelectionDialogProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

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
    excludeChatId,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedUsers([]);
    }
  }, [isOpen]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.id === user.id);
      if (exists) {
        return prev.filter((u) => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const removeSelectedUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtEndRef = useRef(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    isAtEndRef.current = Math.abs(scrollWidth - clientWidth - scrollLeft) < 10;
  };

  const hasSelectedUsers = selectedUsers.length > 0;

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        viewport.scrollLeft += e.deltaY;
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [hasSelectedUsers]);

  useEffect(() => {
    if (isAtEndRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [selectedUsers.length]);

  const handleConfirm = () => {
    if (selectedUsers.length === 0) return;
    onConfirm(selectedUsers);
  };

  const users = (searchResults?.pages.flatMap((page) => page.data) || []).filter(
    (u) => !u.is_blocked_by_me && !existingMemberIds.includes(u.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !isSubmitting && onClose(val)} modal={true}>
      <DialogContent
        size="default"
        className="h-[530px] max-h-[85vh] flex flex-col overflow-hidden"
        onInteractOutside={(e) => {
          e.stopPropagation();
          if (isSubmitting) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          e.stopPropagation();
          if (isSubmitting) e.preventDefault();
        }}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className=" space-y-[1.5px] min-h-0 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          {selectedUsers.length > 0 && (
            <ScrollArea
              className="w-full whitespace-nowrap pt-3"
              viewportRef={scrollRef}
              onScroll={handleScroll}
            >
              <div className="flex gap-2 w-max pr-1">
                {selectedUsers.map((user) => (
                  <Badge key={user.id} variant="secondary" className="pl-1 pr-1 gap-1">
                    <Avatar className="size-4">
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback className="text-[8px]">{user.full_name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="max-w-[100px] truncate">{user.full_name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-3 hover:bg-destructive/20 rounded-full"
                      onClick={() => removeSelectedUser(user.id)}
                      disabled={isSubmitting}
                    >
                      <X className="size-2" />
                    </Button>
                  </Badge>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="top-0" />
            </ScrollArea>
          )}
        </div>

        <div className="flex-1 min-h-0 bg-muted/10 -mx-6 px-6">
          <InfiniteList
            items={users}
            isLoading={isSearching}
            isError={!!isError}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={!!isFetchingNextPage}
            fetchNextPage={fetchNextPage}
            refetch={refetch}
            emptyMessage={debouncedSearch ? "No users found." : "Type name or username to search."}
            loadingHeight="h-10"
            showBorder={false}
            skeletonButtonCount={0}
            skeletonCount={5}
            selectionMode={true}
            resetKey={debouncedSearch}
            renderItem={(user: User) => {
              const isSelected = selectedUsers.some((u) => u.id === user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 hover:bg-muted rounded-md transition-colors cursor-pointer"
                  onClick={() => !isSubmitting && toggleUser(user)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    <Avatar>
                      <AvatarImage src={user.avatar || undefined} />
                      <AvatarFallback>{user.full_name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0 w-full text-left">
                      <span className="text-sm font-medium truncate">{user.full_name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        @{user.username}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </div>

        <div className="mt-auto ">
          <Button
            onClick={handleConfirm}
            disabled={selectedUsers.length === 0 || isSubmitting}
            className="relative w-full"
          >
            <span className={isSubmitting ? "opacity-0" : ""}>
              {confirmLabel} {selectedUsers.length > 0 ? `(${selectedUsers.length})` : ""}
            </span>
            {isSubmitting && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Spinner className="size-4" />
              </div>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
