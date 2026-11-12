import { toast } from "@/lib/toast";
import { mediaService } from "@/services/media.service";
import { userService } from "@/services/user.service";
import { useAuthStore } from "@/store";
import type { User } from "@/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../../test/query-wrapper";
import { MyProfileDialog } from "../my-profile-dialog";

vi.mock("@/services/user.service", () => ({ userService: { updateProfile: vi.fn() } }));
vi.mock("@/services/media.service", () => ({ mediaService: { uploadDirectMedia: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
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
      <div>
        <button onClick={() => onCropComplete(new Blob(["cropped"], { type: "image/png" }))}>
          Accept crop
        </button>
        <button onClick={() => onOpenChange(false)}>Cancel crop</button>
      </div>
    ) : null,
}));
vi.mock("@/components/auth/captcha", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    Captcha: forwardRef(
      ({ onVerify, onError }: { onVerify: (token: string) => void; onError: () => void }, ref) => {
        useImperativeHandle(ref, () => ({ execute: vi.fn(), reset: vi.fn() }));
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

const user: User = {
  id: "u1",
  email: "person@example.com",
  username: "person",
  full_name: "Test Person",
  bio: "Hello",
  avatar: null,
  has_password: true,
};

describe("my profile settings", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const close = vi.fn(),
    security = vi.fn(),
    email = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useAuthStore.getState().setCredentials("session", user);
    vi.mocked(userService.updateProfile).mockResolvedValue({
      ...user,
      full_name: "Updated Person",
    });
    vi.mocked(mediaService.uploadDirectMedia).mockResolvedValue({ id: "avatar-id" } as never);
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => "blob:cropped");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", TestURL);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  function setup(value = user) {
    return render(
      <MyProfileDialog
        open
        user={value}
        onOpenChange={close}
        onOpenSecurity={security}
        onOpenChangeEmail={email}
      />,
      { wrapper: context.wrapper }
    );
  }
  const save = () => screen.getByRole("button", { name: /^Save Changes/ });
  function select(file: File) {
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
  }
  async function crop() {
    select(new File(["image"], "portrait.png", { type: "image/png" }));
    // widget callbacks are simulated outside the modal portal
    fireEvent.click(await screen.findByText("Accept crop"));
  }
  it("disables unchanged saves and keeps email read-only", () => {
    setup();
    expect(save()).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: " Test Person " } });
    expect(save()).toBeDisabled();
  });
  it("opens the native avatar picker through Change Photo without saving metadata", async () => {
    setup();
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(picker, "click");
    fireEvent.pointerDown(
      document.querySelector('[data-slot="dialog-content"] [data-slot="dropdown-menu-trigger"]')!,
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Change Photo" }));
    expect(click).toHaveBeenCalledOnce();
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });
  it("removes an existing avatar and saves an explicit deletion flag", async () => {
    setup({ ...user, avatar: "https://example.com/avatar.png" });
    fireEvent.pointerDown(
      document.querySelector('[data-slot="dialog-content"] [data-slot="dropdown-menu-trigger"]')!,
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove Photo" }));
    fireEvent.click(save());
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(userService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ delete_avatar: true })
    );
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
  });
  it("revokes a cropped preview when it is replaced and then removed", async () => {
    setup();
    await crop();
    await crop();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:cropped");
    fireEvent.pointerDown(
      document.querySelector('[data-slot="dialog-content"] [data-slot="dropdown-menu-trigger"]')!,
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove Photo" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(save()).toBeDisabled();
  });
  it("prevents escape during cropping and makes cancellation restore dialog dismissal", async () => {
    setup();
    select(new File(["image"], "portrait.png", { type: "image/png" }));
    await screen.findByText("Cancel crop");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancel crop"));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledWith(false);
  });
  it("normalizes username, trims fields and updates the real session and query cache", async () => {
    setup();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "New.Person_123" } });
    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: " Updated Person " } });
    fireEvent.change(screen.getByLabelText("Bio"), { target: { value: " New bio " } });
    expect(screen.getByLabelText("Username")).toHaveValue("newperson123");
    fireEvent.click(save());
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(userService.updateProfile).toHaveBeenCalledWith({
      username: "newperson123",
      full_name: "Updated Person",
      bio: "New bio",
    });
    expect(useAuthStore.getState().user?.full_name).toBe("Updated Person");
    expect(useAuthStore.getState().token).toBe("session");
    expect(context.client.getQueryData(["user", "current"])).toMatchObject({
      full_name: "Updated Person",
    });
  });
  it.each([
    ["Full Name", ""],
    ["Username", "a"],
    ["Bio", "x".repeat(10001)],
  ])("rejects invalid %s before mutation", async (field, value) => {
    setup();
    fireEvent.change(screen.getByLabelText(field), { target: { value } });
    fireEvent.click(save());
    expect(userService.updateProfile).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(field), {
      target: { value: field === "Username" ? "validperson" : "Valid text" },
    });
    fireEvent.click(save());
    await waitFor(() => expect(userService.updateProfile).toHaveBeenCalledOnce());
  });
  it.each(["Username taken", undefined])(
    "retains edits after an update failure (%s)",
    async (message) => {
      vi.mocked(userService.updateProfile).mockRejectedValue({
        response: { data: { error: message } },
      });
      setup();
      fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Retained draft" } });
      fireEvent.click(save());
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          message || "Profile update failed",
          expect.anything()
        )
      );
      expect(screen.getByLabelText("Full Name")).toHaveValue("Retained draft");
      expect(save()).toBeEnabled();
      expect(close).not.toHaveBeenCalled();
      expect(useAuthStore.getState().user).toEqual(user);
    }
  );
  it("opens change-email settings for password accounts", () => {
    setup();
    fireEvent.click(screen.getByTitle("Change Email"));
    expect(email).toHaveBeenCalledOnce();
  });
  it("requires OAuth users to set a password before changing email", () => {
    setup({ ...user, has_password: false, bio: null });
    expect(screen.getByTitle("Set password first")).toBeDisabled();
    fireEvent.click(screen.getByText("password", { exact: true }));
    expect(close).toHaveBeenCalledWith(false);
    expect(security).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Bio")).toHaveValue("");
  });
  it("rejects unsupported and oversized avatars without uploading", () => {
    setup();
    select(new File(["text"], "bad.txt", { type: "text/plain" }));
    expect(toast.error).toHaveBeenCalledWith("File format not supported.", expect.anything());
    select(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }));
    expect(toast.error).toHaveBeenCalledWith("File exceeds 2MB limit", expect.anything());
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
  });
  it("uploads the cropped avatar only after CAPTCHA and submits its media ID", async () => {
    setup();
    await crop();
    fireEvent.click(save());
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
    expect(save()).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Verify avatar"));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(mediaService.uploadDirectMedia).toHaveBeenCalledWith(
      expect.objectContaining({ name: "portrait.png", type: "image/png" }),
      { usage: "user_avatar", captchaToken: "avatar-token" }
    );
    expect(userService.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_media_id: "avatar-id" })
    );
  });
  it("keeps a cropped avatar retryable when CAPTCHA fails", async () => {
    setup();
    await crop();
    fireEvent.click(save());
    fireEvent.click(screen.getByText("Fail avatar"));
    await waitFor(() => expect(save()).toBeEnabled());
    expect(toast.error).toHaveBeenCalledWith("Captcha verification failed", expect.anything());
    expect(mediaService.uploadDirectMedia).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it("restores editing when avatar storage fails", async () => {
    vi.mocked(mediaService.uploadDirectMedia).mockRejectedValue(new Error("storage down"));
    setup();
    await crop();
    fireEvent.click(save());
    fireEvent.click(screen.getByText("Verify avatar"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Profile update failed", expect.anything())
    );
    expect(save()).toBeEnabled();
    expect(userService.updateProfile).not.toHaveBeenCalled();
  });
});
