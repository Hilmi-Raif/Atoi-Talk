import { ChatSearchInput } from "@/components/chat-search-input";
import { MobileChatActions } from "@/components/layouts/mobile-chat-actions";
import { MobileUserMenu } from "@/components/layouts/mobile-user-menu";
import { NavChat } from "@/components/layouts/nav-chat";
import Logo from "@/components/logo";
import { useTheme } from "@/components/providers/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useChatListScroll } from "@/hooks/chat-list/use-chat-list-scroll";
import { useChats } from "@/hooks/queries";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { useEffect, useMemo, useState } from "react";

export default function MobileChatListPage() {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const { searchQuery, setSearchQuery } = useChatStore();
  const { user: currentUser } = useAuthStore();
  const setGlobalLoading = useUIStore((state) => state.setGlobalLoading);
  const { theme } = useTheme();

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

  const chats =
    data?.pages.flatMap((page) => page.data).filter((chat) => chat.last_message !== null) || [];
  const isChatListEmpty = chats.length === 0 && !searchQuery && !isLoading && !isError;

  const { scrollRef, handleScroll, handleWheel } = useChatListScroll({
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage: isFetchingNextPage ?? false,
    isError: isError ?? false,
    isFetchedAfterMount,
    fetchNextPage,
  });

  const debouncedSetSearch = useMemo(() => {
    let timeoutId: NodeJS.Timeout;
    const debounced = (value: string) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setSearchQuery(value), 500);
    };
    debounced.cancel = () => clearTimeout(timeoutId);
    return debounced;
  }, [setSearchQuery]);

  useEffect(() => {
    return () => {
      debouncedSetSearch.cancel();
    };
  }, [debouncedSetSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGlobalLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [setGlobalLoading]);

  if (!currentUser) return null;

  return (
    <SidebarProvider>
      <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground md:hidden">
        <header className="flex h-[63px] shrink-0 items-center justify-between border-b border-[#e4e4e7] bg-background px-4 dark:border-[#212224]">
          <div className="flex min-w-0 items-center gap-2">
            <div className="text-sidebar-primary-foreground flex aspect-square size-9 items-center justify-center rounded-lg">
              <Logo mode={theme} width={40} height={40} />
            </div>
            <div className="grid min-w-0 text-left leading-tight">
              <span className="truncate text-sm font-semibold">AtoiTalk</span>
              <span className="truncate text-[11px] text-muted-foreground">Enjoy Your Talk</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <MobileChatActions />
            <MobileUserMenu current={currentUser} />
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
          <ChatSearchInput
            onSearch={debouncedSetSearch}
            initialValue={searchQuery}
            disabled={isChatListEmpty}
          />
          <div
            className="min-h-0 flex-1 overflow-y-auto bg-background"
            onScroll={handleScroll}
            onWheel={handleWheel}
            ref={scrollRef}
          >
            {isChatListEmpty ? (
              <div className="flex min-h-full items-center justify-center px-4 py-10">
                <div className="inline-flex items-center justify-center rounded-full border bg-background px-3 py-1 text-xs font-normal text-foreground">
                  Select a chat and start messaging
                </div>
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
          </div>
        </section>
      </main>
    </SidebarProvider>
  );
}
