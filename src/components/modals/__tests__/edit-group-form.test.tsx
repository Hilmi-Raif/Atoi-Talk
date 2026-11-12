import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { mediaService } from "@/services/media.service";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { EditGroupDialog } from "../edit-group-dialog";

vi.mock("@/services", () => ({ chatService: { updateGroup: vi.fn() } }));
vi.mock("@/services/media.service", () => ({ mediaService: { uploadDirectMedia: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
vi.mock("@/components/auth/captcha", async () => {
  const React = await import("react");
  return {
    Captcha: React.forwardRef(
      ({ onVerify, onError }: { onVerify: (token: string) => void; onError: () => void }, ref) => {
        React.useImperativeHandle(ref, () => ({ execute: vi.fn(), reset: vi.fn() }));
        return (
          <>
            <button onClick={() => onVerify("avatar-token")}>Verify avatar</button>
            <button onClick={onError}>Fail avatar</button>
          </>
        );
      }
    ),
  };
});
vi.mock("@/components/image-cropper", () => ({
  ImageCropper: ({
    open,
    onCropComplete,
    onOpenChange,
  }: {
    open: boolean;
    onCropComplete: (blob: Blob) => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <>
        <button onClick={() => onCropComplete(new Blob(["cropped"], { type: "image/png" }))}>
          Accept crop
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel crop</button>
      </>
    ) : null,
}));
const chat = {
  id: "group-1",
  type: "group" as const,
  name: "Engineering",
  description: "Team",
  avatar: null,
  is_public: false,
  unread_count: 0,
  last_message: null,
  last_read_at: null,
  other_last_read_at: null,
};
describe("group editing through real mutations", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(chatService.updateGroup).mockResolvedValue({ ...chat, name: "Updated" } as never);
    vi.mocked(mediaService.uploadDirectMedia).mockResolvedValue({ id: "media-1" } as never);
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => "blob:avatar");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", TestURL);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function setup() {
    const onClose = vi.fn();
    return {
      ...render(<EditGroupDialog isOpen chat={chat} onClose={onClose} />, {
        wrapper: context.wrapper,
      }),
      onClose,
    };
  }
  async function crop() {
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["avatar"], "portrait.png", { type: "image/png" })] },
    });
    // widget callbacks are simulated outside the modal portal
    fireEvent.click(await screen.findByText("Accept crop"));
  }
  it("dismisses an idle group form with escape without sending changes", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(chatService.updateGroup).not.toHaveBeenCalled();
  });
  it("allows naming a group whose optional metadata is missing", async () => {
    const onClose = vi.fn();
    render(
      <EditGroupDialog
        isOpen
        chat={{ ...chat, name: null, description: null }}
        onClose={onClose}
      />,
      { wrapper: context.wrapper }
    );
    expect(screen.getByLabelText("Group Name")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: "Recovered group" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
    expect(chatService.updateGroup).toHaveBeenCalledWith(
      "group-1",
      expect.objectContaining({ name: "Recovered group" })
    );
  });
  it("leaves the avatar unchanged when the native picker is cancelled", () => {
    setup();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    expect(screen.queryByText("Accept crop")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
  });
  it("recovers from an unanswered avatar challenge without sending a group update", async () => {
    setup();
    await crop();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
    expect(chatService.updateGroup).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Failed to update group");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    expect(screen.getByLabelText("Group Name")).toHaveValue("Engineering");
  });
  it("removes an existing group avatar explicitly without uploading another file", async () => {
    render(
      <EditGroupDialog
        isOpen
        chat={{ ...chat, avatar: "https://example.com/avatar.png" }}
        onClose={vi.fn()}
      />,
      { wrapper: context.wrapper }
    );
    fireEvent.pointerDown(document.querySelector('[data-slot="dropdown-menu-trigger"]')!, {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove Photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(chatService.updateGroup).toHaveBeenCalledWith(
        "group-1",
        expect.objectContaining({ delete_avatar: true })
      )
    );
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
  });
  it("releases replaced cropped previews and allows cancelling a later crop", async () => {
    const { onClose } = setup();
    await crop();
    await crop();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["next"], "next.png", { type: "image/png" })] },
    });
    await screen.findByText("Accept crop");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel crop"));
    expect(screen.queryByText("Accept crop")).not.toBeInTheDocument();
  });
  it("ignores whitespace-only changes and saves normalized metadata and visibility", async () => {
    const { onClose } = setup();
    const save = screen.getByRole("button", { name: "Save Changes" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: " Engineering " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: " Updated " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: " New team " } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(save);
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
    expect(chatService.updateGroup).toHaveBeenCalledWith("group-1", {
      name: "Updated",
      description: "New team",
      is_public: true,
    });
  });
  it("omits an empty optional description", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(chatService.updateGroup).toHaveBeenCalledWith("group-1", {
        name: "Engineering",
        is_public: false,
      })
    );
  });
  it("rejects invalid names and descriptions, then recovers after correction", () => {
    setup();
    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: "" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: "Updated" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "x".repeat(10001) },
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Valid" } });
    expect(save).toBeEnabled();
    expect(chatService.updateGroup).not.toHaveBeenCalled();
  });
  it.each(["unsupported", "oversized"])("rejects an %s avatar", (kind) => {
    const file =
      kind === "unsupported"
        ? new File(["bad"], "bad.txt", { type: "text/plain" })
        : new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    setup();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(toast.error).toHaveBeenCalled();
    expect(screen.queryByText("Accept crop")).not.toBeInTheDocument();
  });
  it("uploads a cropped avatar only after verification and saves its media ID", async () => {
    const { onClose } = setup();
    await crop();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Verify avatar"));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
    expect(mediaService.uploadDirectMedia).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portrait.png", type: "image/png" }),
      { usage: "group_avatar", captchaToken: "avatar-token" }
    );
    expect(chatService.updateGroup).toHaveBeenCalledWith(
      "group-1",
      expect.objectContaining({ avatar_media_id: "media-1" })
    );
  });
  it.each(["captcha", "storage", "update"])(
    "retains the draft and unlocks saving after a %s failure",
    async (stage) => {
      if (stage === "storage")
        vi.mocked(mediaService.uploadDirectMedia).mockRejectedValueOnce(new Error("storage"));
      if (stage === "update")
        vi.mocked(chatService.updateGroup).mockRejectedValueOnce(new Error("update"));
      const { onClose } = setup();
      fireEvent.change(screen.getByLabelText("Group Name"), { target: { value: "Draft" } });
      if (stage !== "update") await crop();
      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
      if (stage !== "update")
        fireEvent.click(screen.getByText(stage === "captcha" ? "Fail avatar" : "Verify avatar"));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update group"));
      expect(screen.getByLabelText("Group Name")).toHaveValue("Draft");
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    }
  );
});
