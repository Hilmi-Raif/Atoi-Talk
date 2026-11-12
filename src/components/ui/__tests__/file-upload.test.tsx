import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FileUpload,
  FileUploadClear,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadItemProgress,
  FileUploadList,
  FileUploadTrigger,
  useFileUpload,
} from "../file-upload";

function Items({ circular = false }: { circular?: boolean }) {
  const files = useFileUpload((state) => Array.from(state.files.keys()));
  return (
    <FileUploadList>
      {files.map((file) => (
        <FileUploadItem key={file.name} value={file}>
          <FileUploadItemPreview />
          <FileUploadItemMetadata />
          <FileUploadItemProgress circular={circular} />
          <FileUploadItemDelete>Remove {file.name}</FileUploadItemDelete>
        </FileUploadItem>
      ))}
    </FileUploadList>
  );
}

function Upload({
  circular,
  ...props
}: ComponentProps<typeof FileUpload> & { circular?: boolean }) {
  return (
    <FileUpload {...props}>
      <FileUploadDropzone aria-label="Drop files">
        <FileUploadTrigger>Choose files</FileUploadTrigger>
      </FileUploadDropzone>
      <Items circular={circular} />
      <FileUploadClear>Clear files</FileUploadClear>
    </FileUpload>
  );
}

const file = (name = "notes.txt", content = "hello", type = "text/plain") =>
  new File([content], name, { type });
function select(files: File[]) {
  fireEvent.change(screen.getByLabelText("File upload"), { target: { files } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("FileUpload", () => {
  it("accepts dropped files through the native input and clears the drag state", () => {
    class Transfer {
      files: File[] = [];
      items = { add: (selected: File) => this.files.push(selected) };
    }
    vi.stubGlobal("DataTransfer", Transfer);
    const accepted = vi.fn();
    render(<Upload onAccept={accepted} />);
    const input = screen.getByLabelText("File upload") as HTMLInputElement;
    let files: File[] = [];
    Object.defineProperty(input, "files", {
      configurable: true,
      get: () => files,
      set: (value: File[]) => {
        files = value;
      },
    });
    const selected = file("dropped.txt");
    const dropzone = screen.getByLabelText("Drop files");
    fireEvent.dragEnter(dropzone);
    expect(dropzone).toHaveAttribute("data-dragging");
    fireEvent.drop(dropzone, { dataTransfer: { files: [selected] } });
    expect(screen.getByText("dropped.txt")).toBeVisible();
    expect(accepted).toHaveBeenCalledWith([selected]);
    expect(dropzone).not.toHaveAttribute("data-dragging");
  });
  it.each([undefined, "Only one document may be selected"])(
    "rejects overflow files with the applicable validation message %s",
    (message) => {
      const rejected = vi.fn();
      render(<Upload maxFiles={1} onFileValidate={() => message} onFileReject={rejected} />);
      const first = file("first.txt");
      const second = file("second.txt");
      select([first, second]);
      expect(rejected).toHaveBeenCalledWith(second, message || "Maximum 1 files allowed");
      if (message) expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
      else expect(screen.getByText("first.txt")).toBeVisible();
    }
  );
  it("does not change a controlled selection when the native picker is cancelled", () => {
    const changed = vi.fn();
    render(<Upload value={[file()]} onValueChange={changed} />);
    changed.mockClear();
    fireEvent.change(screen.getByLabelText("File upload"), { target: { files: null } });
    expect(screen.getByText("notes.txt")).toBeVisible();
    expect(changed).not.toHaveBeenCalled();
  });
  it("preserves metadata, progress and removal when item primitives are composed as children", () => {
    const selected = file("composed.txt");
    render(
      <FileUpload defaultValue={[selected]}>
        <FileUploadList>
          <FileUploadItem value={selected}>
            <FileUploadItemPreview render={() => <span>Document preview</span>} />
            <FileUploadItemMetadata asChild>
              <section>Custom metadata</section>
            </FileUploadItemMetadata>
            <FileUploadItemProgress />
            <FileUploadItemDelete asChild>
              <button>Remove composed file</button>
            </FileUploadItemDelete>
          </FileUploadItem>
        </FileUploadList>
      </FileUpload>
    );
    expect(screen.getByRole("listitem")).toBeVisible();
    expect(screen.getByText("Custom metadata").tagName).toBe("SECTION");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("Document preview")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove composed file" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
  it("retains the same controlled file across parent updates and clears an explicit invalid state", () => {
    const selected = file();
    const { rerender } = render(<Upload value={[selected]} invalid />);
    expect(screen.getByText("notes.txt")).toBeVisible();
    expect(screen.getByLabelText("Drop files")).toHaveAttribute("data-invalid", "");
    rerender(<Upload value={[selected]} invalid={false} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("Drop files")).not.toHaveAttribute("data-invalid");
  });
  it("keeps a selection when consumers cancel delete and clear actions", () => {
    const selected = file();
    render(
      <FileUpload defaultValue={[selected]}>
        <FileUploadList>
          <FileUploadItem value={selected}>
            <FileUploadItemMetadata />
            <FileUploadItemDelete onClick={(event) => event.preventDefault()}>
              Keep file
            </FileUploadItemDelete>
          </FileUploadItem>
        </FileUploadList>
        <FileUploadClear onClick={(event) => event.preventDefault()}>Keep all</FileUploadClear>
      </FileUpload>
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep file" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    expect(screen.getByRole("listitem")).toBeVisible();
    expect(screen.getByText("notes.txt")).toBeVisible();
  });
  it("supports a custom preview and horizontal list without losing file metadata", () => {
    const selected = file("a.txt", "x");
    render(
      <FileUpload defaultValue={[selected]}>
        <FileUploadList orientation="horizontal" asChild>
          <section>
            <FileUploadItem value={selected}>
              <FileUploadItemPreview render={(value) => <strong>Preview {value.name}</strong>} />
              <FileUploadItemMetadata />
              <FileUploadItemProgress />
            </FileUploadItem>
          </section>
        </FileUploadList>
      </FileUpload>
    );
    expect(screen.getByText("Preview a.txt")).toBeVisible();
    expect(screen.getByText("1 B")).toBeVisible();
    expect(screen.getByRole("list").tagName).toBe("SECTION");
    expect(screen.getByRole("list")).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
  it("can mount empty lists and slotted clear controls for a stable layout", () => {
    render(
      <FileUpload>
        <FileUploadList forceMount />
        <FileUploadClear forceMount asChild>
          <button>Clear empty selection</button>
        </FileUploadClear>
      </FileUpload>
    );
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Clear empty selection" }));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
  it("does not render an item whose file is no longer in the controlled selection", () => {
    const selected = file();
    render(
      <FileUpload value={[]}>
        <FileUploadList forceMount>
          <FileUploadItem value={selected}>
            <FileUploadItemMetadata />
          </FileUploadItem>
        </FileUploadList>
      </FileUpload>
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
  it.each(["click", "keyDown", "dragEnter", "dragOver", "dragLeave", "drop"] as const)(
    "respects consumer cancellation of dropzone %s",
    (event) => {
      const handler = vi.fn((value: React.SyntheticEvent) => value.preventDefault());
      const prop = `on${event[0].toUpperCase()}${event.slice(1)}`;
      render(
        <FileUpload>
          <FileUploadDropzone {...{ [prop]: handler }} />
        </FileUpload>
      );
      const click = vi.spyOn(screen.getByLabelText("File upload"), "click");
      fireEvent[event](screen.getByRole("region"), { key: "Enter" });
      expect(handler).toHaveBeenCalledOnce();
      expect(click).not.toHaveBeenCalled();
      expect(screen.getByRole("region")).not.toHaveAttribute("data-dragging");
    }
  );

  it("does not open the picker for unrelated keys or a cancelled trigger", () => {
    render(
      <FileUpload>
        <FileUploadDropzone>
          <FileUploadTrigger onClick={(event) => event.preventDefault()}>Choose</FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
    );
    const click = vi.spyOn(screen.getByLabelText("File upload"), "click");
    fireEvent.keyDown(screen.getByRole("region"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(click).not.toHaveBeenCalled();
  });

  it("passes every accepted file to its individual acceptance callback", () => {
    const accepted = vi.fn();
    render(<Upload multiple onFileAccept={accepted} />);
    const first = file();
    const second = file("second.txt");
    select([first, second]);
    expect(accepted.mock.calls).toEqual([[first], [second]]);
  });

  it("lists selected files with accessible positions and removes individual files", () => {
    const changes = vi.fn();
    render(<Upload multiple onValueChange={changes} />);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    const first = file();
    const second = file("other.txt", "");
    select([first, second]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")[1]).toHaveAttribute("aria-posinset", "2");
    expect(screen.getByText("0 B")).toBeVisible();
    expect(screen.getByText("5 B")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove notes.txt" }));
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    expect(changes).toHaveBeenLastCalledWith([second]);
    fireEvent.click(screen.getByRole("button", { name: "Clear files" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(changes).toHaveBeenLastCalledWith([]);
  });

  it.each(["image/*", "image/png", ".png"])(
    "accepts files matching %s and rejects mismatches",
    (accept) => {
      const rejected = vi.fn();
      const accepted = vi.fn();
      render(<FileUpload accept={accept} onFileReject={rejected} onAccept={accepted} />);
      const image = file("photo.png", "png", "image/png");
      const text = file();
      select([image, text]);
      expect(accepted).toHaveBeenCalledWith([image]);
      expect(rejected).toHaveBeenCalledWith(text, "File type not accepted");
    }
  );

  it("enforces size boundaries, custom validation and the remaining file count", () => {
    const rejected = vi.fn();
    const accepted = vi.fn();
    render(
      <Upload
        maxFiles={2}
        maxSize={5}
        onFileReject={rejected}
        onAccept={accepted}
        onFileValidate={(value) => (value.name === "blocked.txt" ? "Blocked by policy" : undefined)}
      />
    );
    const existing = file();
    select([existing]);
    const large = file("large.txt", "123456");
    const blocked = file("blocked.txt");
    select([large, blocked]);
    expect(rejected).toHaveBeenCalledWith(blocked, "Blocked by policy");
    expect(rejected).toHaveBeenCalledWith(large, "File too large");
    const extra = file("extra.txt");
    select([extra, file("overflow.txt")]);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ name: "overflow.txt" }),
      "Maximum 2 files allowed"
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(accepted).toHaveBeenLastCalledWith([extra]);
  });

  it("clears temporary invalid state after two seconds", () => {
    vi.useFakeTimers();
    render(<Upload maxSize={1} />);
    select([file()]);
    expect(screen.getByRole("region")).toHaveAttribute("aria-invalid", "true");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("region")).toHaveAttribute("aria-invalid", "false");
  });

  it("synchronizes externally controlled files without retaining removed values", () => {
    const first = file();
    const second = file("replacement.txt");
    const { rerender } = render(<Upload value={[first]} />);
    expect(screen.getByText("notes.txt")).toBeVisible();
    rerender(<Upload value={[second]} />);
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
    expect(screen.getByText("replacement.txt")).toBeVisible();
  });

  it("initializes default files and disables selection controls", () => {
    render(<Upload defaultValue={[file()]} disabled />);
    expect(screen.getByText("notes.txt")).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear files" })).toBeDisabled();
    select([file("ignored.txt")]);
    expect(screen.queryByText("ignored.txt")).not.toBeInTheDocument();
  });

  it("opens the native picker once from a nested trigger and from keyboard activation", () => {
    render(<Upload />);
    const click = vi.spyOn(screen.getByLabelText("File upload"), "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose files" }));
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("region"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("region"), { key: " " });
    fireEvent.click(screen.getByRole("region"));
    expect(click).toHaveBeenCalledTimes(4);
  });

  it("tracks drag entry, movement and leaving", () => {
    render(<Upload />);
    const region = screen.getByRole("region");
    fireEvent.dragEnter(region);
    expect(region).toHaveAttribute("data-dragging");
    fireEvent.dragLeave(region);
    expect(region).not.toHaveAttribute("data-dragging");
    fireEvent.dragOver(region);
    expect(region).toHaveAttribute("data-dragging");
  });

  it("clamps upload progress and renders completion", async () => {
    let controls: Parameters<NonNullable<ComponentProps<typeof FileUpload>["onUpload"]>>[1];
    const selected = file();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    render(
      <Upload
        onUpload={(_, options) => {
          controls = options;
        }}
      />
    );
    select([selected]);
    expect(screen.getByText("Uploading: 0% complete")).toBeInTheDocument();
    act(() => controls.onProgress(selected, 130));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    act(() => controls.onProgress(selected, -10));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    act(() => controls.onSuccess(selected));
    expect(screen.getByText("Upload complete")).toBeInTheDocument();
  });

  it("shows per-file upload errors and hides circular progress after success", () => {
    let controls: Parameters<NonNullable<ComponentProps<typeof FileUpload>["onUpload"]>>[1];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const selected = file();
    render(
      <Upload
        circular
        onUpload={(_, options) => {
          controls = options;
        }}
      />
    );
    select([selected]);
    act(() => controls.onError(selected, new Error("Storage unavailable")));
    expect(screen.getByText("Storage unavailable")).toBeVisible();
    expect(screen.getByText("Error: Storage unavailable")).toBeInTheDocument();
    act(() => controls.onSuccess(selected));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it.each([new Error("Upload interrupted"), "unknown failure"])(
    "reports an upload callback rejection",
    async (error) => {
      vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
      render(
        <Upload
          onUpload={async () => {
            throw error;
          }}
        />
      );
      select([file()]);
      expect(
        await screen.findByText(error instanceof Error ? error.message : "Upload failed")
      ).toBeVisible();
    }
  );

  it.each([
    ["clip.mp4", "video/mp4", "file-video"],
    ["song.mp3", "audio/mpeg", "file-audio"],
    ["notes.txt", "text/plain", "file-text"],
    ["script.ts", "", "file-code"],
    ["bundle.zip", "", "file-archive"],
    ["installer.apk", "", "file-cog"],
    ["unknown.bin", "", "file"],
  ])("renders a type-appropriate preview for %s", (name, type, icon) => {
    render(<Upload defaultValue={[file(name, "data", type)]} />);
    const item = screen.getByRole("listitem");
    expect(item.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
    expect(within(item).getByText(name)).toBeVisible();
  });

  it("revokes an image preview URL once loaded", () => {
    const revoke = vi.fn();
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => "blob:test-preview");
      static revokeObjectURL = revoke;
    }
    vi.stubGlobal("URL", TestURL);
    render(<Upload defaultValue={[file("photo.png", "png", "image/png")]} />);
    const image = screen.getByRole("img", { name: "photo.png" });
    expect(image).toHaveAttribute("src", "blob:test-preview");
    fireEvent.load(image);
    expect(revoke).toHaveBeenCalledWith("blob:test-preview");
  });
});
