import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { GroupMember } from "@/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useGroupMemberActions } from "../use-group-member-actions";

vi.mock("@/services", () => ({
  chatService: {
    kickGroupMember: vi.fn(),
    updateMemberRole: vi.fn(),
    transferOwnership: vi.fn(),
  },
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

const member = {
  id: "membership-2",
  user_id: "u2",
  full_name: "Ada",
  role: "member",
} as GroupMember;
const other = { ...member, id: "membership-3", user_id: "u3", full_name: "Grace" };
const paged = (data: GroupMember[]) => ({ pages: [{ data }], pageParams: [null] });

describe("group member confirmation flows", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(chatService.kickGroupMember).mockResolvedValue({ member_count: 2 } as never);
    vi.mocked(chatService.updateMemberRole).mockResolvedValue({} as never);
    vi.mocked(chatService.transferOwnership).mockResolvedValue({} as never);
  });
  afterEach(() => context.client.clear());

  function setup(search = "") {
    function Harness() {
      const actions = useGroupMemberActions({ chatId: "group-1", memberSearch: search });
      return (
        <>
          <button onClick={() => actions.setKickCandidate(member)}>Choose remove</button>
          <button onClick={() => actions.handlePromoteToAdmin(member)}>Choose promote</button>
          <button onClick={() => actions.handleDemoteToMember(member)}>Choose demote</button>
          <button onClick={() => actions.handleTransferOwnership(member)}>Choose transfer</button>
          {actions.renderConfirmationDialogs()}
        </>
      );
    }
    render(<Harness />, context);
  }

  it.each(["", "ab", "Ada"])(
    "removes the confirmed member from the matching search cache (%s)",
    async (search) => {
      const key = ["group-members", "infinite", "group-1", search.length >= 3 ? search : ""];
      context.client.setQueryData(key, paged([member, other]));
      context.client.setQueryData(
        ["group-members", "infinite", "other-group", ""],
        paged([member])
      );
      context.client.setQueryData(["users", "search", "Ada"], { stale: true });
      setup(search);
      fireEvent.click(screen.getByRole("button", { name: "Choose remove" }));
      expect(screen.getByText("Are you sure you want to remove Ada from the group?")).toBeVisible();
      expect(chatService.kickGroupMember).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Remove", exact: true }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(chatService.kickGroupMember).toHaveBeenCalledWith("group-1", "u2");
      expect(context.client.getQueryData(key)).toEqual(paged([other]));
      expect(context.client.getQueryData(["group-members", "infinite", "other-group", ""])).toEqual(
        paged([member])
      );
      expect(context.client.getQueryData(["users", "search", "Ada"])).toBeUndefined();
    }
  );

  it.each([
    ["promote", "Promote", "admin"],
    ["demote", "Demote", "member"],
  ])("confirms a %s operation and reconciles cached membership", async (action, confirm, role) => {
    const key = ["group-members", "infinite", "group-1", ""];
    context.client.setQueryData(
      key,
      paged([{ ...member, role: role === "admin" ? "member" : "admin" }, other])
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: `Choose ${action}` }));
    fireEvent.click(screen.getByRole("button", { name: confirm, exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(chatService.updateMemberRole).toHaveBeenCalledWith("group-1", "u2", role);
    expect(context.client.getQueryData(key)).toEqual(
      paged([{ ...member, role } as GroupMember, other])
    );
  });

  it("transfers ownership only after confirmation", async () => {
    const key = ["group-members", "infinite", "group-1", ""];
    context.client.setQueryData(key, paged([member, other]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Choose transfer" }));
    expect(chatService.transferOwnership).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Transfer Ownership", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(chatService.transferOwnership).toHaveBeenCalledWith("group-1", "u2");
    expect(context.client.getQueryData(key)).toEqual(paged([{ ...member, role: "owner" }, other]));
  });

  it.each(["remove", "promote", "demote", "transfer"])(
    "cancels %s without performing a mutation",
    (action) => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: `Choose ${action}` }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(chatService.kickGroupMember).not.toHaveBeenCalled();
      expect(chatService.updateMemberRole).not.toHaveBeenCalled();
      expect(chatService.transferOwnership).not.toHaveBeenCalled();
    }
  );

  it("retains the candidate and membership when removal fails so it can be retried", async () => {
    vi.mocked(chatService.kickGroupMember).mockRejectedValueOnce(new Error("offline"));
    const key = ["group-members", "infinite", "group-1", ""];
    context.client.setQueryData(key, paged([member]));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Choose remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove", exact: true }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to remove member"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove", exact: true })).toBeEnabled()
    );
    expect(context.client.getQueryData(key)).toEqual(paged([member]));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(context.client.getQueryData(key)).toEqual(paged([]));
  });
});
