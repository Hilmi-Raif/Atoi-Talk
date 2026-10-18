import { InfiniteList } from "@/components/infinite-list";
import { Button } from "@/components/ui/button";
import api from "@/lib/axios";
import { ChatMute, useNotificationPreferences } from "@/lib/notification-preferences";
import { useAuthStore } from "@/store";
import { PaginatedResponse } from "@/types";
import { useInfiniteQuery } from "@tanstack/react-query";

export function MutedConversations({
  open,
  busy,
  onUnmute,
}: {
  open: boolean;
  busy: boolean;
  onUnmute: (id: string) => Promise<void>;
}) {
  const token = useAuthStore((state) => state.token);
  const query = useInfiniteQuery({
    queryKey: ["muted-conversations", token],
    initialPageParam: "",
    enabled: open && Boolean(token),
    queryFn: async ({ pageParam, signal }) => {
      const response = await api.get<PaginatedResponse<ChatMute>>(
        "/api/notifications/muted-chats",
        {
          params: { cursor: pageParam || undefined, limit: 20 },
          signal,
        }
      );
      if (useAuthStore.getState().token === token)
        useNotificationPreferences.getState().mergeChats(response.data.data);
      return response.data;
    },
    getNextPageParam: (page) => (page.meta.has_next ? page.meta.next_cursor : undefined),
  });
  return (
    <div className="h-64 min-h-0 overflow-hidden">
      <InfiniteList
        items={query.data?.pages.flatMap((page) => page.data) ?? []}
        isLoading={query.isLoading}
        isError={query.isError}
        hasNextPage={Boolean(query.hasNextPage)}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={() => {
          void query.fetchNextPage();
        }}
        refetch={() => {
          void query.refetch();
        }}
        emptyMessage="No muted conversations."
        skeletonButtonCount={1}
        renderItem={(m) => (
          <div key={m.chat_id} className="flex items-center justify-between gap-3 p-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{m.name || "Conversation"}</p>
              <p className="text-xs text-muted-foreground">
                {m.muted_forever
                  ? "Until turned back on"
                  : `Until ${new Date(m.muted_until!).toLocaleString()}`}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void onUnmute(m.chat_id)
                  .then(() => query.refetch())
                  .catch(() => {});
              }}
            >
              Unmute
            </Button>
          </div>
        )}
      />
    </div>
  );
}
