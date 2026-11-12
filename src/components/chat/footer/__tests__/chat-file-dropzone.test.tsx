import { Media } from "@/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatFileDropzone } from "../chat-file-dropzone";

describe("chat file selection and upload states", () => {
  afterEach(cleanup);
  function setup(overrides: Partial<React.ComponentProps<typeof ChatFileDropzone>> = {}) {
    const props = {
      attachmentMode: true,
      uploadingFiles: [],
      onFilesChange: vi.fn().mockResolvedValue(undefined),
      isGlobalUploading: false,
      isSending: false,
      isEditing: false,
      isCancelling: false,
      attachments: [],
      editMessage: null,
      fileListRef: createRef<HTMLDivElement>(),
      onRefreshMedia: vi.fn().mockResolvedValue(undefined),
      onRemoveAttachment: vi.fn(),
      onRemoveEditAttachment: vi.fn(),
      onCancelUploads: vi.fn(),
      ...overrides,
    };
    const view = render(<ChatFileDropzone {...props} />);
    return { ...view, props };
  }
  it("does not mount the picker outside attachment mode", () => {
    const { container } = setup({ attachmentMode: false });
    expect(container).toBeEmptyDOMElement();
  });
  it("passes selected files to the upload workflow", async () => {
    const { container, props } = setup();
    const files = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.pdf", { type: "application/pdf" }),
    ];
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });
    expect(props.onFilesChange).toHaveBeenCalledWith(files);
    await waitFor(() => expect(screen.getByText("Drag & drop files here")).toBeVisible());
  });
  it.each(["isGlobalUploading", "isSending", "isEditing", "isCancelling", "isLoading"] as const)(
    "prevents picker activation while %s",
    (flag) => {
      setup({ [flag]: true });
      expect(screen.getByRole("button")).toBeDisabled();
    }
  );
  it("offers upload cancellation without activating the picker", async () => {
    const { props, container } = setup({
      isGlobalUploading: true,
      uploadingFiles: [new File(["a"], "a.txt")],
    });
    const click = vi.spyOn(
      container.querySelector('input[type="file"]')! as HTMLInputElement,
      "click"
    );
    await waitFor(() => expect(screen.getByText("Uploading your file....")).toBeVisible());
    fireEvent.click(screen.getByText("cancel"));
    expect(props.onCancelUploads).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
  it("shows cancellation progress instead of offering another cancellation", async () => {
    setup({
      isCancelling: true,
      isGlobalUploading: true,
      uploadingFiles: [new File(["a"], "a.txt")],
    });
    await waitFor(() => expect(screen.getByText("Cancelling your uploads...")).toBeVisible());
    expect(screen.queryByText("cancel")).not.toBeInTheDocument();
  });
  it("renders only retained attachments and routes deletion by original index or media ID", () => {
    const media = (id: string) =>
      ({
        id,
        original_name: `${id}.pdf`,
        url: `https://media.example/${id}`,
        mime_type: "application/pdf",
        file_size: 100,
      }) as Media;
    const { props } = setup({
      attachments: [media("new")],
      editMessage: {
        id: "m1",
        content: "",
        attachments: [
          { ...media("removed"), delete: true },
          { ...media("retained"), delete: false },
        ],
      } as never,
    });
    expect(screen.queryByText("removed")).not.toBeInTheDocument();
    const retained = screen.getByText("retained").closest('[data-slot="card"]')!;
    const added = screen.getByText("new").closest('[data-slot="card"]')!;
    fireEvent.click(retained.querySelector("button")!);
    fireEvent.click(added.querySelector("button")!);
    expect(props.onRemoveEditAttachment).toHaveBeenCalledWith(1);
    expect(props.onRemoveAttachment).toHaveBeenCalledWith("new");
  });
});
