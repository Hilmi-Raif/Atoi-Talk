import { toast } from "@/lib/toast";
import { chatService, userService } from "@/services";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { AddMembersDialog } from "../add-members-dialog";

vi.mock("@/services", () => ({
  chatService: { addGroupMember: vi.fn() },
  userService: { searchUsers: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const ada = { id: "ada", full_name: "Ada", username: "ada", avatar: null, is_online: true };
describe("adding members through the selection dialog", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const close = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [ada],
      meta: { has_next: false },
    } as never);
    vi.mocked(chatService.addGroupMember).mockResolvedValue({ member_count: 2 } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  async function select() {
    render(
      <AddMembersDialog isOpen onClose={close} groupId="g1" existingMemberIds={["existing"]} />,
      { wrapper: context.wrapper }
    );
    fireEvent.change(screen.getByPlaceholderText("Search users..."), { target: { value: "Ada" } });
    fireEvent.click(await screen.findByText("@ada"));
    fireEvent.click(screen.getByRole("button", { name: "Add (1)" }));
  }
  it("appends complete member records to the last cached page without replacing earlier pages", async () => {
    const key = ["group-members", "infinite", "g1", ""];
    context.client.setQueryData(key, {
      pages: [
        { data: [{ id: "existing" }], meta: { next_cursor: "next" } },
        { data: [], meta: { has_next: false } },
      ],
      pageParams: [undefined, "next"],
    });
    await select();
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(chatService.addGroupMember).toHaveBeenCalledWith("g1", ["ada"]);
    const cached = context.client.getQueryData<{ pages: { data: unknown[] }[] }>(key)!;
    expect(cached.pages[0].data).toEqual([{ id: "existing" }]);
    expect(cached.pages[1].data).toEqual([
      expect.objectContaining({
        id: "ada",
        user_id: "ada",
        full_name: "Ada",
        username: "ada",
        role: "member",
        is_online: true,
        joined_at: expect.any(String),
      }),
    ]);
  });
  it("finishes without inventing member pages when the member list has not been loaded", async () => {
    await select();
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(context.client.getQueryData(["group-members", "infinite", "g1", ""])).toBeUndefined();
  });
  it("keeps the selected member and the dialog available after a rejected addition", async () => {
    vi.mocked(chatService.addGroupMember).mockRejectedValueOnce(new Error("offline"));
    await select();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add (1)" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Add (1)" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  });
});
