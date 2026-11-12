import { toast } from "@/lib/toast";
import { userService } from "@/services";
import { useAuthStore, useUIStore } from "@/store";
import { Message, User } from "@/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { SystemMessage } from "../system-message";

vi.mock("@/services", () => ({ userService: { getUserById: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

const actor: User = {
  id: "actor",
  full_name: "Alice",
  username: "alice",
  email: "alice@example.com",
  avatar: null,
  bio: null,
  has_password: true,
};
let query: ReturnType<typeof createQueryWrapper>;
function show(type: string, data: Record<string, string> = {}, content = "") {
  const message = {
    id: "event-1",
    type,
    content,
    sender_id: "actor",
    sender_name: "Alice",
    action_data: { target_id: "target", target_name: "Bob", ...data },
  } as Message;
  return render(<SystemMessage message={message} />, { wrapper: query.wrapper });
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
  useAuthStore.getState().logout();
  useUIStore.getState().reset();
});
afterEach(() => query.client.clear());

describe("SystemMessage", () => {
  it.each([
    ["system_create", { initial_name: "Engineering" }, 'Group "Engineering" created by Alice'],
    ["system_create", {}, 'Group "Group" created by Alice'],
    ["system_rename", { new_name: "Design" }, 'Alice changed group name to "Design"'],
    ["system_description", {}, "Alice updated group description"],
    ["system_avatar", {}, "Alice updated group icon"],
    ["system_avatar", { action: "removed" }, "Alice removed group icon"],
    ["system_avatar", { delete_avatar: "true" }, "Alice removed group icon"],
    ["system_add", {}, "Alice added Bob"],
    ["system_leave", {}, "Alice left the group"],
    ["system_kick", {}, "Alice removed Bob"],
    ["system_promote", { new_role: "admin" }, "Alice promoted Bob to admin"],
    ["system_promote", { new_role: "owner" }, "Alice transferred ownership to Bob"],
    ["system_promote", { action: "ownership_transferred" }, "Alice transferred ownership to Bob"],
    ["system_demote", { new_role: "member" }, "Alice demoted Bob to member"],
    ["system_transfer", {}, "Alice transferred ownership to Bob"],
    ["system_join", {}, "Alice joined the group"],
    ["system_visibility", { new_visibility: "public" }, "Alice made the group public"],
  ])("describes %s correctly", (type, data, expected) => {
    const { container } = show(type, data);
    expect(container.textContent).toBe(expected);
  });

  it("uses supplied fallback content for unrecognized events", () => {
    show("unknown", {}, "The group was migrated");
    expect(screen.getByText("The group was migrated")).toBeVisible();
  });

  it("uses a default notification for empty unrecognized events", () => {
    show("unknown");
    expect(screen.getByText("System notification")).toBeVisible();
  });

  it("labels the authenticated actor as You", () => {
    useAuthStore.getState().setCredentials("token", actor);
    show("system_leave");
    expect(screen.getByText("You")).toBeVisible();
    fireEvent.click(screen.getByText("You"));
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it("prefers cached profile names and truncates long names and group titles", () => {
    query.client.setQueryData(["user", "actor"], { ...actor, full_name: "ABCDEFGHIJKLMNOPQRST" });
    show("system_create", { initial_name: "12345678901234567890" });
    expect(screen.getByText("ABCDEFGHIJKLMNO...")).toBeVisible();
    expect(screen.getByText("123456789012345...")).toBeVisible();
  });

  it("renders a deleted account without making it interactive", () => {
    show("system_add", { target_id: "", target_name: "Old name" });
    fireEvent.click(screen.getByText("Deleted Account"));
    expect(userService.getUserById).not.toHaveBeenCalled();
  });

  it("fetches a clicked profile and opens it only after successful loading", async () => {
    let resolve!: (value: User) => void;
    vi.mocked(userService.getUserById).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    show("system_leave");
    fireEvent.click(screen.getByText("Alice"));
    expect(useUIStore.getState().isLoadingProfile).toBe(true);
    expect(useUIStore.getState().profileModal.isOpen).toBe(false);
    resolve(actor);
    await waitFor(() => expect(useUIStore.getState().profileModal.userId).toBe("actor"));
    expect(query.client.getQueryData(["user", "actor"])).toEqual(actor);
    expect(useUIStore.getState().isLoadingProfile).toBe(false);
  });

  it("keeps the modal closed and clears loading after a failed profile fetch", async () => {
    vi.mocked(userService.getUserById).mockRejectedValue(new Error("unavailable"));
    show("system_leave");
    fireEvent.click(screen.getByText("Alice"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to load user profile"));
    expect(useUIStore.getState().isLoadingProfile).toBe(false);
    expect(useUIStore.getState().profileModal.isOpen).toBe(false);
  });

  it("ignores profile clicks while another UI operation is busy", () => {
    useUIStore.getState().setBusy(true);
    show("system_leave");
    fireEvent.click(screen.getByText("Alice"));
    expect(userService.getUserById).not.toHaveBeenCalled();
  });
});
