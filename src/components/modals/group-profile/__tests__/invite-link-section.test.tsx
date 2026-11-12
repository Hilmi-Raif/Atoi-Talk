import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../../test/query-wrapper";
import { InviteLinkSection } from "../invite-link-section";

vi.mock("@/services", () => ({ chatService: { resetGroupInviteCode: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

describe("group invite links", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const writeText = vi.fn().mockResolvedValue(undefined);
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(chatService.resetGroupInviteCode).mockResolvedValue({ code: "replacement" } as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  });
  function setup(props: Partial<React.ComponentProps<typeof InviteLinkSection>> = {}) {
    return render(
      <InviteLinkSection
        chatId="g1"
        inviteCode="original"
        isPublic={false}
        isAdminOrOwner={true}
        {...props}
      />,
      { wrapper: context.wrapper }
    );
  }

  it.each([null, undefined, ""])("renders no controls when the code is %s", (inviteCode) => {
    const { container } = setup({ inviteCode });
    expect(container).toBeEmptyDOMElement();
  });
  it("copies the absolute invite URL without offering reset to ordinary members", () => {
    setup({ isAdminOrOwner: false });
    fireEvent.click(screen.getByTitle("Copy Link"));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/original`);
    expect(toast.success).toHaveBeenCalledWith("Link copied to clipboard");
    expect(screen.queryByTitle("Reset Link")).not.toBeInTheDocument();
  });
  it.each([true, false])(
    "only displays the expiration date for private groups (public=%s)",
    (isPublic) => {
      setup({ isPublic, inviteExpiresAt: "2099-01-02T00:00:00Z" });
      expect(screen.getByTitle("Copy Link")).toBeEnabled();
      if (isPublic) expect(screen.queryByText(/Expires /)).not.toBeInTheDocument();
      else expect(screen.getByText(/Expires /)).toHaveTextContent("2099");
    }
  );
  it("requires confirmation before rotating an active link and updates cached metadata", async () => {
    context.client.setQueryData(["chat", "g1"], { id: "g1", invite_code: "original" });
    setup();
    fireEvent.click(screen.getByTitle("Reset Link"));
    const dialog = await screen.findByRole("dialog", { name: "Reset Invite Link?" });
    expect(chatService.resetGroupInviteCode).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(chatService.resetGroupInviteCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Reset Link"));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Reset Link" })
    );
    await waitFor(() =>
      expect(context.client.getQueryData(["chat", "g1"])).toMatchObject({
        invite_code: "replacement",
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("disables copying an expired link and rotates it without another confirmation", async () => {
    setup({ inviteExpiresAt: "2000-01-01T00:00:00Z" });
    expect(screen.getByText("Invite link has expired")).toBeVisible();
    fireEvent.click(screen.getByTitle("Copy Link"));
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Reset Link"));
    await waitFor(() => expect(chatService.resetGroupInviteCode).toHaveBeenCalledWith("g1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invite link has been reset"));
  });
  it("retains confirmation and the old cached link after a failed rotation", async () => {
    vi.mocked(chatService.resetGroupInviteCode).mockRejectedValue(new Error("offline"));
    context.client.setQueryData(["chat", "g1"], { invite_code: "original" });
    setup();
    fireEvent.click(screen.getByTitle("Reset Link"));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Reset Link" })
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to reset invite link"));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(context.client.getQueryData(["chat", "g1"])).toEqual({ invite_code: "original" });
  });
});
