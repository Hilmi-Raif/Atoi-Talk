import { userService } from "@/services";
import { User } from "@/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { UserSelectionDialog } from "../user-selection-dialog";

vi.mock("@/services", () => ({ userService: { searchUsers: vi.fn() } }));
const ada = { id: "u2", full_name: "Ada", username: "ada", avatar: null } as User;
const grace = { ...ada, id: "u3", full_name: "Grace", username: "grace" };

describe("selecting group members", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const confirm = vi.fn();
  const close = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [ada, grace],
      meta: { has_next: false },
    } as never);
  });
  afterEach(() => context.client.clear());
  function setup(props: Partial<React.ComponentProps<typeof UserSelectionDialog>> = {}) {
    return render(
      <UserSelectionDialog isOpen onClose={close} onConfirm={confirm} {...props} />,
      context
    );
  }
  function search(value = "Ada") {
    fireEvent.change(screen.getByPlaceholderText("Search users..."), { target: { value } });
  }

  it("waits for a nonempty debounced search and excludes the active chat", async () => {
    setup({ excludeChatId: "g1" });
    expect(screen.getByText("Type name or username to search.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(userService.searchUsers).not.toHaveBeenCalled();
    search("  Ada  ");
    expect(userService.searchUsers).not.toHaveBeenCalled();
    expect(await screen.findByText("@ada")).toBeVisible();
    expect(userService.searchUsers).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Ada", exclude_chat_id: "g1", limit: 20 }),
      expect.anything()
    );
  });
  it("hides existing members and blocked users from search results", async () => {
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [ada, grace, { ...ada, id: "blocked", username: "blocked", is_blocked_by_me: true }],
      meta: { has_next: false },
    } as never);
    setup({ existingMemberIds: [grace.id] });
    search();
    expect(await screen.findByText("@ada")).toBeVisible();
    expect(screen.queryByText("@grace")).not.toBeInTheDocument();
    expect(screen.queryByText("@blocked")).not.toBeInTheDocument();
  });
  it("toggles selections and confirms only the remaining selected users", async () => {
    setup({ confirmLabel: "Invite" });
    search();
    fireEvent.click(await screen.findByText("@ada"));
    fireEvent.click(screen.getByText("@grace"));
    expect(screen.getByRole("button", { name: "Invite (2)" })).toBeEnabled();
    fireEvent.click(screen.getByText("@ada"));
    fireEvent.click(screen.getByRole("button", { name: "Invite (1)" }));
    expect(confirm).toHaveBeenCalledWith([grace]);
  });
  it("removes a selected badge independently of the search result", async () => {
    const view = setup();
    search();
    fireEvent.click(await screen.findByText("@ada"));
    const remove = view.container.ownerDocument.querySelector('[data-slot="badge"] button')!;
    fireEvent.click(remove);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getAllByRole("checkbox", { checked: false })).toHaveLength(2);
  });
  it("scrolls selected badges horizontally without hijacking a horizontal-only wheel event", async () => {
    setup();
    search();
    fireEvent.click(await screen.findByText("@ada"));
    const viewport = document.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement;
    viewport.scrollLeft = 10;
    const downward = new WheelEvent("wheel", { deltaY: 25, cancelable: true });
    viewport.dispatchEvent(downward);
    expect(viewport.scrollLeft).toBe(35);
    expect(downward.defaultPrevented).toBe(true);
    const horizontal = new WheelEvent("wheel", { deltaY: 0, deltaX: 25, cancelable: true });
    viewport.dispatchEvent(horizontal);
    expect(horizontal.defaultPrevented).toBe(false);
    expect(viewport.scrollLeft).toBe(35);
    Object.defineProperties(viewport, {
      scrollWidth: { configurable: true, value: 500 },
      clientWidth: { configurable: true, value: 100 },
    });
    fireEvent.scroll(viewport);
    fireEvent.click(screen.getByText("@grace"));
    expect(viewport.scrollLeft).toBe(35);
  });
  it("clears previous search and selections when reopened", async () => {
    const view = setup();
    search();
    fireEvent.click(await screen.findByText("@ada"));
    view.rerender(<UserSelectionDialog isOpen={false} onClose={close} onConfirm={confirm} />);
    view.rerender(<UserSelectionDialog isOpen onClose={close} onConfirm={confirm} />);
    expect(screen.getByPlaceholderText("Search users...")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });
  it("keeps submission locked against input changes and dismissal", () => {
    setup({ isSubmitting: true });
    expect(screen.getByPlaceholderText("Search users...")).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Add/ })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });
  it("shows an empty result rather than suggesting selection", async () => {
    vi.mocked(userService.searchUsers).mockResolvedValue({
      data: [],
      meta: { has_next: false },
    } as never);
    setup();
    search();
    expect(await screen.findByText("No users found.")).toBeVisible();
    expect(confirm).not.toHaveBeenCalled();
  });
  it("recovers a failed user search through Retry", async () => {
    vi.mocked(userService.searchUsers).mockRejectedValueOnce(new Error("offline"));
    setup();
    search();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("@ada")).toBeVisible();
    await waitFor(() => expect(userService.searchUsers).toHaveBeenCalledTimes(2));
  });
});
