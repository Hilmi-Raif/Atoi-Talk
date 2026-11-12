import { toast } from "@/lib/toast";
import { chatService } from "@/services";
import { mediaService } from "@/services/media.service";
import type { User } from "@/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChangeEvent, ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useCreateGroupForm } from "../use-create-group-form";

vi.mock("@/services", () => ({ chatService: { createGroup: vi.fn() } }));
vi.mock("@/services/media.service", () => ({ mediaService: { uploadDirectMedia: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

const member = { id: "u2", full_name: "Member" } as User;
const event = (file?: File) =>
  ({
    target: { files: file ? [file] : [], value: "selected" },
  }) as unknown as ChangeEvent<HTMLInputElement>;

describe("create group form", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  let close: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    close = vi.fn();
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => "blob:avatar");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", TestURL);
    vi.mocked(chatService.createGroup).mockResolvedValue({
      id: "new-group",
      messages: [],
    } as never);
    vi.mocked(mediaService.uploadDirectMedia).mockResolvedValue({ id: "avatar-media" } as never);
  });
  afterEach(() => {
    context.client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  function setup() {
    const Query = context.wrapper;
    return renderHook(() => ({ ...useCreateGroupForm(close), location: useLocation() }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <Query>{children}</Query>
        </MemoryRouter>
      ),
    });
  }
  function fill(result: ReturnType<typeof setup>["result"]) {
    act(() => {
      result.current.setGroupName("  Engineering  ");
      result.current.setSelectedMembers([member]);
    });
  }

  it("validates missing group name before contacting the API", async () => {
    const { result } = setup();
    await act(() => result.current.handleCreateGroup());
    expect(result.current.groupErrors.name).toBeTruthy();
    expect(chatService.createGroup).not.toHaveBeenCalled();
    act(() => result.current.validateGroupField("name", "Valid group"));
    expect(result.current.groupErrors.name).toBeUndefined();
    act(() => result.current.validateGroupField("description", "x".repeat(10001)));
    expect(result.current.groupErrors.description).toBeTruthy();
    act(() => result.current.validateGroupField("description", "Short description"));
    expect(result.current.groupErrors.description).toBeUndefined();
  });

  it("requires a member after valid name validation", async () => {
    const { result } = setup();
    act(() => result.current.setGroupName("Engineering"));
    await act(() => result.current.handleCreateGroup());
    expect(toast.error).toHaveBeenCalledWith("Please select at least 1 member");
    expect(chatService.createGroup).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "creates a group with trimmed fields and visibility %s",
    async (isPublic) => {
      const { result } = setup();
      fill(result);
      act(() => {
        result.current.setGroupDescription("  Team discussions  ");
        result.current.setIsPublic(isPublic);
      });
      await act(() => result.current.handleCreateGroup());
      expect(chatService.createGroup).toHaveBeenCalledWith({
        name: "Engineering",
        description: "Team discussions",
        member_ids: ["u2"],
        is_public: isPublic,
      });
      expect(result.current.location.pathname).toBe("/chat/new-group");
      expect(close).toHaveBeenCalledWith(false);
      expect(result.current.groupName).toBe("");
      expect(result.current.selectedMembers).toEqual([]);
      expect(result.current.isPublic).toBe(false);
      expect(result.current.isCreatingGroup).toBe(false);
    }
  );

  it("omits blank description and preserves form inputs on API failure", async () => {
    vi.mocked(chatService.createGroup).mockRejectedValue(new Error("Offline"));
    const { result } = setup();
    fill(result);
    act(() => result.current.setGroupDescription("   "));
    await act(() => result.current.handleCreateGroup());
    expect(chatService.createGroup).toHaveBeenCalledWith({
      name: "Engineering",
      member_ids: ["u2"],
      is_public: false,
    });
    expect(result.current.groupName).toBe("  Engineering  ");
    expect(result.current.selectedMembers).toEqual([member]);
    expect(result.current.isCreatingGroup).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it("rejects unsupported and oversized avatar files without opening crop", () => {
    const { result } = setup();
    act(() => result.current.handleGroupAvatarChange(event()));
    act(() =>
      result.current.handleGroupAvatarChange(
        event(new File(["x"], "virus.exe", { type: "application/octet-stream" }))
      )
    );
    act(() =>
      result.current.handleGroupAvatarChange(
        event(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }))
      )
    );
    expect(result.current.cropModalOpen).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("File format not supported.", expect.any(Object));
    expect(toast.error).toHaveBeenCalledWith("File exceeds 2MB limit", expect.any(Object));
  });

  it("reads an avatar, crops it preserving its filename, and revokes replaced previews", async () => {
    const { result } = setup();
    const selected = event(new File(["png"], "Team.PNG", { type: "image/png" }));
    act(() => result.current.handleGroupAvatarChange(selected));
    await waitFor(() => expect(result.current.cropModalOpen).toBe(true));
    expect(result.current.selectedImage).toMatch(/^data:image\/png;base64,/);
    expect(selected.target.value).toBe("");
    act(() => result.current.handleCropComplete(new Blob(["cropped"], { type: "image/webp" })));
    expect(result.current.groupAvatar?.name).toBe("Team.PNG");
    expect(result.current.groupAvatar?.type).toBe("image/webp");
    expect(result.current.cropModalOpen).toBe(false);
    act(() => result.current.handleCropComplete(new Blob(["second"])));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
    expect(result.current.groupAvatar?.type).toBe("image/jpeg");
    act(() => result.current.handleDeleteGroupAvatar());
    expect(result.current.groupAvatar).toBeNull();
    expect(result.current.groupAvatarPreview).toBeNull();
  });

  it("waits for CAPTCHA then uploads the avatar before group creation", async () => {
    const { result } = setup();
    fill(result);
    act(() => result.current.handleCropComplete(new Blob(["image"], { type: "image/jpeg" })));
    let request: Promise<void>;
    act(() => {
      request = result.current.handleCreateGroup();
    });
    expect(result.current.isCreatingGroup).toBe(true);
    expect(chatService.createGroup).not.toHaveBeenCalled();
    await act(async () => {
      result.current.handleCaptchaVerify("verified-token");
      await request;
    });
    expect(mediaService.uploadDirectMedia).toHaveBeenCalledWith(expect.any(File), {
      usage: "group_avatar",
      captchaToken: "verified-token",
    });
    expect(chatService.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_media_id: "avatar-media" })
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:avatar");
    expect(result.current.groupAvatar).toBeNull();
  });

  it.each(["error", "timeout", "upload"])(
    "retains the avatar and form after %s failure",
    async (failure) => {
      vi.useFakeTimers();
      const { result } = setup();
      fill(result);
      act(() => result.current.handleCropComplete(new Blob(["image"])));
      let request: Promise<void>;
      act(() => {
        request = result.current.handleCreateGroup();
      });
      await act(async () => {
        if (failure === "timeout") await vi.advanceTimersByTimeAsync(30000);
        else if (failure === "error") result.current.handleCaptchaError();
        else {
          vi.mocked(mediaService.uploadDirectMedia).mockRejectedValue(new Error("Storage offline"));
          result.current.handleCaptchaVerify("token");
        }
        await request;
      });
      expect(chatService.createGroup).not.toHaveBeenCalled();
      expect(result.current.groupName).toBe("  Engineering  ");
      expect(result.current.groupAvatar).toBeInstanceOf(File);
      expect(result.current.isCreatingGroup).toBe(false);
      expect(close).not.toHaveBeenCalled();
    }
  );
});
