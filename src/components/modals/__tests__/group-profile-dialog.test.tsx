import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { ChatListItem, User } from "@/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { GroupProfileDialog } from "../group-profile-dialog";

vi.mock("@/services", () => ({
  chatService: {
    getChatById: vi.fn(),
    getGroupMembers: vi.fn(),
    leaveGroup: vi.fn(),
    deleteGroup: vi.fn(),
    kickGroupMember: vi.fn(),
    updateMemberRole: vi.fn(),
    transferOwnership: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn(), debugLog: vi.fn() }));
const group = {
  id: "g1",
  type: "group",
  name: "Engineering",
  member_count: 3,
  my_role: "member",
  avatar: null,
  description: "Team discussion",
} as ChatListItem;
const member = {
  id: "membership2",
  user_id: "u2",
  full_name: "Ada Lovelace",
  username: "ada",
  role: "member",
};

describe("group profile workflows", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useUIStore.getState().reset();
    useChatStore.getState().reset();
    useAuthStore.getState().setCredentials("token", { id: "u1", full_name: "Test Person" } as User);
    vi.mocked(chatService.getGroupMembers).mockResolvedValue({ data: [member], meta: {} } as never);
    vi.mocked(chatService.leaveGroup).mockResolvedValue(undefined);
    vi.mocked(chatService.deleteGroup).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
    useChatStore.getState().reset();
    useUIStore.getState().reset();
  });
  function setup(overrides: Partial<ChatListItem> = {}, isOpen = true) {
    const chat = { ...group, ...overrides };
    context.client.setQueryData(["chat", "g1"], chat);
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/group"]}>
        <Routes>
          <Route
            path="/group"
            element={<GroupProfileDialog chat={chat} isOpen={isOpen} onClose={onClose} />}
          />
          <Route path="/" element={<h1>Home destination</h1>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
    return { onClose, chat };
  }
  async function members() {
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), {
      button: 0,
      ctrlKey: false,
    });
    return screen.findByText("Ada Lovelace");
  }
  it("keeps a closed profile out of the DOM without fetching members", () => {
    setup({}, false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chatService.getGroupMembers).not.toHaveBeenCalled();
  });
  it("closes the idle group profile with Escape", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Group Info" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(false);
  });
  it.each(["owner", "admin"] as const)(
    "opens member selection for a group %s and retains the parent dialog",
    async (my_role) => {
      const { onClose } = setup({ my_role });
      await members();
      fireEvent.click(screen.getByTitle("Add Members"));
      const dialog = await screen.findByRole("dialog", { name: "Add Members" });
      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Add Members" })).not.toBeInTheDocument()
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Group Info" })).toBeVisible();
    }
  );
  it("loads members only after opening their tab and opens the selected public profile", async () => {
    setup();
    expect(screen.getByText("Team discussion")).toBeVisible();
    expect(chatService.getGroupMembers).not.toHaveBeenCalled();
    expect(await members()).toBeVisible();
    expect(chatService.getGroupMembers).toHaveBeenCalledWith(
      "g1",
      { query: undefined, cursor: undefined, limit: 20 },
      expect.any(AbortSignal)
    );
    fireEvent.click(screen.getByTitle("View Profile"));
    expect(useUIStore.getState().profileModal).toMatchObject({ isOpen: true, userId: "u2" });
    expect(screen.queryByTitle("Add Members")).not.toBeInTheDocument();
  });
  it("debounces member search and supports an empty result", async () => {
    setup();
    await members();
    vi.mocked(chatService.getGroupMembers).mockResolvedValue({ data: [], meta: {} } as never);
    fireEvent.change(screen.getByPlaceholderText("Search members..."), {
      target: { value: "Nobody" },
    });
    expect(await screen.findByText("No members found.")).toBeVisible();
    expect(chatService.getGroupMembers).toHaveBeenLastCalledWith(
      "g1",
      { query: "Nobody", cursor: undefined, limit: 20 },
      expect.any(AbortSignal)
    );
  });
  it("retries member retrieval after a failed request", async () => {
    vi.mocked(chatService.getGroupMembers).mockRejectedValueOnce(new Error("offline"));
    setup();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Members" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Ada Lovelace")).toBeVisible();
  });
  it.each(["owner", "admin"] as const)("opens the edit form for a group %s", async (my_role) => {
    setup({ my_role });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit Group" })).toBeVisible();
  });
  it("opens a report for an ordinary member without leaving the group", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(await screen.findByRole("dialog", { name: "Report Group" })).toBeVisible();
    expect(chatService.leaveGroup).not.toHaveBeenCalled();
  });
  it.each(["owner", "member"] as const)(
    "confirms the %s's destructive action and navigates after acknowledgement",
    async (my_role) => {
      const { onClose } = setup({ my_role });
      useChatStore.getState().setActiveChatId("g1");
      fireEvent.click(
        screen.getByRole("button", { name: my_role === "owner" ? "Delete" : "Leave" })
      );
      const dialog = await screen.findByRole("dialog", {
        name: my_role === "owner" ? "Delete Group?" : "Leave Group?",
      });
      expect(chatService.leaveGroup).not.toHaveBeenCalled();
      expect(chatService.deleteGroup).not.toHaveBeenCalled();
      fireEvent.click(
        within(dialog).getByRole("button", { name: my_role === "owner" ? "Delete Group" : "Leave" })
      );
      await waitFor(() =>
        expect(
          my_role === "owner" ? chatService.deleteGroup : chatService.leaveGroup
        ).toHaveBeenCalledWith("g1")
      );
      await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
      expect(useChatStore.getState().activeChatId).toBeNull();
      expect(await screen.findByRole("heading", { name: "Home destination" })).toBeVisible();
    }
  );
  it("retains leave confirmation after rejection so the member can retry", async () => {
    vi.mocked(chatService.leaveGroup).mockRejectedValueOnce(new Error("offline"));
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave Group?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to leave group"));
    expect(dialog).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Leave Group?" })).not.toBeInTheDocument()
    );
  });
});
