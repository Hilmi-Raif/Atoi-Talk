import { Media } from "@/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AttachmentCard from "../attachment-card";

const media = (name: string, mime_type: string): Media =>
  ({
    id: "media1",
    original_name: name,
    mime_type,
    url: "https://storage.example/original",
    file_size: 2048,
  }) as Media;

describe("AttachmentCard", () => {
  it.each([
    ["clip.mp4", "video/mp4", "file-video"],
    ["song.mp3", "audio/mpeg", "file-audio"],
    ["notes.txt", "text/plain", "file-text"],
    ["source.py", "", "file-code"],
    ["archive.tar", "", "file-archive"],
    ["setup.exe", "", "file-cog"],
    ["data", "", "file"],
  ])("shows the filename, size and appropriate icon for %s", (name, type, icon) => {
    const { container } = render(
      <AttachmentCard file={media(name, type)} onClick={() => {}} isSender={false} />
    );
    expect(screen.getByTitle(name)).toHaveTextContent(name);
    expect(screen.getByText("2.0 KB")).toBeVisible();
    expect(container.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
  });

  it("invokes the download action only while enabled", () => {
    const click = vi.fn();
    const file = media("document.pdf", "application/pdf");
    const { rerender } = render(<AttachmentCard file={file} onClick={click} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(click).not.toHaveBeenCalled();
    rerender(<AttachmentCard file={file} onClick={click} />);
    fireEvent.click(screen.getByRole("button"));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("loads a normal image and stops its click from reaching the parent", () => {
    const open = vi.fn();
    const parent = vi.fn();
    render(
      <div onClick={parent}>
        <AttachmentCard
          file={media("photo.png", "image/png")}
          onClick={() => {}}
          onImageClick={open}
        />
      </div>
    );
    const image = screen.getByRole("img");
    expect(image).toHaveClass("opacity-0");
    fireEvent.load(image);
    expect(image).toHaveClass("opacity-100");
    fireEvent.click(image);
    expect(open).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });

  it("shows a failure placeholder when no image refresh is available", async () => {
    const { container } = render(
      <AttachmentCard file={media("photo.png", "image/png")} onClick={() => {}} />
    );
    fireEvent.error(screen.getByRole("img"));
    await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
    expect(container.querySelector("svg.lucide-image-off")).not.toBeNull();
  });

  it("attempts refresh only once for the same URL", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <AttachmentCard
        file={media("photo.png", "image/png")}
        onClick={() => {}}
        onRefresh={refresh}
      />
    );
    fireEvent.error(screen.getByRole("img"));
    await waitFor(() => expect(refresh).toHaveBeenCalledWith("media1"));
    fireEvent.error(screen.getByRole("img"));
    await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("resets failed-image state when a fresh URL arrives", async () => {
    const file = media("photo.png", "image/png");
    const refresh = vi.fn().mockRejectedValue(new Error("expired"));
    const { rerender } = render(
      <AttachmentCard file={file} onClick={() => {}} onRefresh={refresh} />
    );
    fireEvent.error(screen.getByRole("img"));
    await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
    rerender(
      <AttachmentCard
        file={{ ...file, url: "https://storage.example/new" }}
        onClick={() => {}}
        onRefresh={refresh}
      />
    );
    expect(await screen.findByRole("img")).toHaveAttribute("src", "https://storage.example/new");
  });

  it("renders an editable image thumbnail and delegates its remove action", () => {
    const remove = vi.fn();
    render(
      <AttachmentCard
        file={{ ...media("photo.png", "image/png"), file_size: 0 }}
        onClick={remove}
        isEditMode
      />
    );
    const image = screen.getByRole("img");
    fireEvent.load(image);
    expect(image).not.toHaveClass("opacity-0");
    expect(screen.getByText("0 B")).toBeVisible();
    fireEvent.click(screen.getByRole("button"));
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("handles thumbnail refresh failures in edit mode", async () => {
    const { container } = render(
      <AttachmentCard
        file={media("photo.png", "image/png")}
        onClick={() => {}}
        isEditMode
        onRefresh={async () => {
          throw new Error("gone");
        }}
      />
    );
    fireEvent.error(screen.getByRole("img"));
    await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
    expect(container.querySelector("svg.lucide-image-off")).not.toBeNull();
  });
});
