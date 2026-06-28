import { EditGroupDialog } from "@/components/modals/edit-group-dialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpdateGroup = vi.fn();

vi.mock("@/hooks/mutations/use-group", () => ({
  useUpdateGroup: () => ({
    mutateAsync: mockUpdateGroup,
    isPending: false,
  }),
}));

vi.mock("@/components/auth/captcha", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    Captcha: React.forwardRef((_props, ref) => {
      React.useImperativeHandle(ref, () => ({
        reset: vi.fn(),
        getResponse: vi.fn(),
      }));
      return <div data-testid="mock-captcha" />;
    }),
  };
});

vi.mock("@/components/image-cropper", () => ({
  ImageCropper: ({
    open,
    onCropComplete,
  }: {
    open: boolean;
    onCropComplete: (blob: Blob) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onCropComplete(new Blob(["avatar"], { type: "image/png" }))}
      >
        Finish Crop
      </button>
    ) : null,
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  errorLog: vi.fn(),
}));

const chat = {
  id: "group-1",
  type: "group" as const,
  name: "Test Group",
  avatar: null,
  unread_count: 0,
  last_read_at: null,
  other_last_read_at: null,
  last_message: null,
  description: "Initial description",
  is_public: false,
};

describe("EditGroupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows submit loading immediately while avatar captcha is pending", async () => {
    const user = userEvent.setup();
    render(<EditGroupDialog isOpen onClose={vi.fn()} chat={chat} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] },
    });

    fireEvent.click(await screen.findByText("Finish Crop"));

    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
    expect(mockUpdateGroup).not.toHaveBeenCalled();
  });
});
