import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { chatService, messageService } from "@/services";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { FindGroupTab } from "../public-group-search/find-group-tab";

vi.mock("@/services", () => ({
  chatService: { searchPublicGroups: vi.fn(), joinGroup: vi.fn() },
  messageService: { getMessages: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const group = {
  id: "g1",
  chat_id: "chat-1",
  name: "Engineering",
  description: "Team chat",
  member_count: 4,
  is_member: false,
  avatar: null,
};
describe("finding and joining public groups", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const close = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(chatService.searchPublicGroups).mockResolvedValue({
      data: [group],
      meta: {},
    } as never);
    vi.mocked(chatService.joinGroup).mockResolvedValue({
      id: "chat-1",
      type: "group",
      name: "Engineering",
    } as never);
    vi.mocked(messageService.getMessages).mockResolvedValue({ data: [], meta: {} } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function Harness() {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    return (
      <Tabs value="find">
        <FindGroupTab
          activeTab="find"
          search={search}
          setSearch={setSearch}
          debouncedSearch={debouncedSearch}
          setDebouncedSearch={setDebouncedSearch}
          onClose={close}
        />
      </Tabs>
    );
  }
  function setup() {
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Harness />} />
          <Route path="/chat/:id" element={<h1>Group destination</h1>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  async function groupButton() {
    const name = await screen.findByText("Engineering");
    return within(name.parentElement!.parentElement!.parentElement!).getByRole("button");
  }
  it("lists popular groups, then debounces and trims a search", async () => {
    setup();
    expect(await screen.findByText("4 members")).toBeVisible();
    expect(screen.getByText("Team chat")).toBeVisible();
    expect(chatService.searchPublicGroups).toHaveBeenCalledWith(
      expect.objectContaining({ query: "", sort_by: "member_count", limit: 20 }),
      expect.anything()
    );
    fireEvent.change(screen.getByPlaceholderText("Search public groups..."), {
      target: { value: "  Team  " },
    });
    await waitFor(
      () =>
        expect(chatService.searchPublicGroups).toHaveBeenCalledWith(
          expect.objectContaining({ query: "Team", sort_by: undefined }),
          expect.anything()
        ),
      { timeout: 1500 }
    );
  });
  it("distinguishes an empty discovery listing from empty search results", async () => {
    vi.mocked(chatService.searchPublicGroups).mockResolvedValue({ data: [], meta: {} } as never);
    setup();
    expect(await screen.findByText("No groups available.")).toBeVisible();
    fireEvent.change(screen.getByPlaceholderText("Search public groups..."), {
      target: { value: "Missing" },
    });
    expect(await screen.findByText("No groups found.")).toBeVisible();
  });
  it("opens an existing membership without sending a join request", async () => {
    vi.mocked(chatService.searchPublicGroups).mockResolvedValue({
      data: [{ ...group, is_member: true, description: null, member_count: 0 }],
      meta: {},
    } as never);
    setup();
    fireEvent.click(await groupButton());
    expect(await screen.findByRole("heading", { name: "Group destination" })).toBeVisible();
    expect(close).toHaveBeenCalledWith(false);
    expect(chatService.joinGroup).not.toHaveBeenCalled();
  });
  it("joins and primes message history before navigating", async () => {
    setup();
    fireEvent.click(await groupButton());
    expect(await screen.findByRole("heading", { name: "Group destination" })).toBeVisible();
    expect(chatService.joinGroup).toHaveBeenCalledWith("chat-1");
    expect(context.client.getQueryData(["chat", "chat-1"])).toMatchObject({ name: "Engineering" });
    expect(close).toHaveBeenCalledWith(false);
  });
  it("re-enables a rejected join and allows retry", async () => {
    vi.mocked(chatService.joinGroup).mockRejectedValueOnce(new Error("Denied"));
    setup();
    fireEvent.click(await groupButton());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const button = await groupButton();
    await waitFor(() => expect(button).toBeEnabled());
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByRole("heading", { name: "Group destination" })).toBeVisible();
  });
});
