import { MutedConversations } from "@/components/muted-conversations";
import api from "@/lib/axios";
import { useAuthStore } from "@/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@/components/infinite-list", () => ({
  InfiniteList: (p: {
    items: { chat_id: string; name: string }[];
    renderItem: (item: { chat_id: string; name: string }) => React.ReactNode;
    hasNextPage: boolean;
    fetchNextPage: () => void;
  }) => (
    <div>
      {p.items.map(p.renderItem)}
      {p.hasNextPage && <button onClick={p.fetchNextPage}>Load next page</button>}
    </div>
  ),
}));
it("loads cursor pages only while open and unmutes without removing other rows", async () => {
  useAuthStore.setState({ token: "session-a" });
  const page = (id: string, more: boolean) => ({
    data: {
      data: [{ chat_id: id, name: id, muted_forever: true }],
      meta: { has_next: more, next_cursor: more ? "cursor-a" : "" },
    },
  });
  vi.mocked(api.get)
    .mockResolvedValueOnce(page("Friends", true))
    .mockResolvedValueOnce(page("Work", false))
    .mockResolvedValue(page("Work", false));
  const unmute = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (open: boolean) => (
    <QueryClientProvider client={client}>
      <MutedConversations open={open} busy={false} onUnmute={unmute} />
    </QueryClientProvider>
  );
  const mounted = render(view(false));
  expect(api.get).not.toHaveBeenCalled();
  mounted.rerender(view(true));
  await screen.findByText("Friends");
  fireEvent.click(await screen.findByText("Load next page"));
  await screen.findByText("Work");
  expect(api.get).toHaveBeenNthCalledWith(
    2,
    "/api/notifications/muted-chats",
    expect.objectContaining({ params: { cursor: "cursor-a", limit: 20 } })
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Unmute" })[0]);
  await waitFor(() => expect(unmute).toHaveBeenCalledWith("Friends"));
  expect(screen.getByText("Work")).toBeInTheDocument();
});
