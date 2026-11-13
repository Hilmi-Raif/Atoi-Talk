import { ChatSearchInput } from "@/components/chat-search-input.tsx";
import { NavChat } from "@/components/layouts/nav-chat.tsx";
import { NavFooter } from "@/components/layouts/nav-footer.tsx";
import { NavHeader } from "@/components/layouts/nav-header.tsx";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { useChatListScroll } from "@/hooks/chat-list/use-chat-list-scroll";
import { useChats } from "@/hooks/queries";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import * as React from "react";
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [activeMenu, setActiveMenu] = React.useState<string | null>(null);
  const { searchQuery, setSearchQuery } = useChatStore();

  const { user: currentUser } = useAuthStore();
  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);

  const {
    data,
    isLoading,
    isFetchedAfterMount,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    refetch,
  } = useChats({ query: searchQuery });

  const chats = React.useMemo(() => {
    const list =
      data?.pages.flatMap((page) => page.data).filter((chat) => chat.last_message !== null) || [];
    return [...list].sort((a, b) => {
      const timeA = a.last_message ? new Date(a.last_message.created_at).getTime() : 0;
      const timeB = b.last_message ? new Date(b.last_message.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }, [data]);
  const isChatListEmpty = chats.length === 0 && !searchQuery && !isLoading && !isError;
  const isSearchEmpty = chats.length === 0 && !!searchQuery.trim() && !isLoading && !isError;

  const { scrollRef, handleScroll, handleWheel } = useChatListScroll({
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage: isFetchingNextPage ?? false,
    isError: isError ?? false,
    isFetchedAfterMount,
    fetchNextPage,
  });

  const debouncedSetSearch = React.useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    const debounced = (value: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setSearchQuery(value), 500);
    };
    debounced.cancel = () => clearTimeout(timeoutId);
    return debounced;
  }, [setSearchQuery]);

  React.useEffect(() => {
    return () => {
      debouncedSetSearch.cancel();
    };
  }, [debouncedSetSearch]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setGlobalLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [setGlobalLoading]);

  if (!currentUser) return null;

  return (
    <Sidebar className={"bg-background"} collapsible="icon" {...props}>
      <SidebarHeader className="border-b bg-background">
        <NavHeader />
      </SidebarHeader>
      <SidebarContent
        className="bg-background"
        onScroll={handleScroll}
        onWheel={handleWheel}
        scrollRef={scrollRef}
      >
        <ChatSearchInput
          onSearch={debouncedSetSearch}
          initialValue={searchQuery}
          disabled={isChatListEmpty}
        />
        {isSearchEmpty || isChatListEmpty ? (
          <div
            role="status"
            className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden"
          >
            No chats found.
          </div>
        ) : (
          <NavChat
            chats={chats}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            isError={isError}
            refetch={refetch}
          />
        )}
      </SidebarContent>
      <SidebarFooter className="bg-background">
        {currentUser && (
          <NavFooter current={currentUser} activeMenu={activeMenu} setActiveMenu={setActiveMenu} />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
