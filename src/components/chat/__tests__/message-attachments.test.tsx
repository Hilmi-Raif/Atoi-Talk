import { toast } from "@/lib/toast";
import { mediaService } from "@/services/media.service";
import { Media, Message } from "@/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { MessageAttachments } from "../message-attachments";

vi.mock("@/services/media.service", () => ({ mediaService: { refreshMediaUrl: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
let query: ReturnType<typeof createQueryWrapper>;
const attachment = (id: string, mime = "application/pdf"): Media =>
  ({
    id,
    mime_type: mime,
    original_name: `${id}.${mime.startsWith("image/") ? "png" : "pdf"}`,
    url: `https://storage.example/${id}`,
    file_size: 1024,
  }) as Media;
function show(attachments?: (Media | null)[]) {
  const message = { id: "m1", chat_id: "chat1", attachments } as Message;
  query.client.setQueryData(["messages", "chat1"], {
    pages: [{ data: [message], meta: {} }],
    pageParams: [undefined],
  });
  return render(<MessageAttachments message={message} isCurrentUser={false} />, {
    wrapper: query.wrapper,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
  class TestURL extends URL {
    static createObjectURL = vi.fn(() => "blob:download");
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", TestURL);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {
  query.client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MessageAttachments", () => {
  it.each([undefined, []])("renders nothing without attachments", (attachments) => {
    expect(show(attachments).container).toBeEmptyDOMElement();
  });

  it("filters null entries and renders deleted placeholders without download controls", () => {
    show([
      null,
      { ...attachment("deleted-file"), is_deleted: true },
      { ...attachment("deleted-image", "image/png"), is_deleted: true },
    ]);
    expect(screen.getByText("Attachment has been deleted")).toBeVisible();
    expect(screen.getByText("Deleted")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("downloads a document using its original filename and releases its blob URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("file bytes")));
    let downloadedName = "";
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadedName = this.download;
    });
    show([attachment("document")]);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download"));
    expect(downloadedName).toBe("document.pdf");
    expect(fetch).toHaveBeenCalledWith("https://storage.example/document");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("refreshes an expired URL, retries downloading and reconciles the cached attachment", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("expired", { status: 403 }))
        .mockResolvedValueOnce(new Response("bytes"))
    );
    vi.mocked(mediaService.refreshMediaUrl).mockResolvedValue("https://storage.example/fresh");
    show([attachment("document"), attachment("other")]);
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    expect(fetch).toHaveBeenNthCalledWith(2, "https://storage.example/fresh");
    expect(query.client.getQueryData(["messages", "chat1"])).toMatchObject({
      pages: [
        {
          data: [
            {
              attachments: [
                { id: "document", url: "https://storage.example/fresh" },
                { id: "other", url: "https://storage.example/other" },
              ],
            },
          ],
        },
      ],
    });
  });

  it.each([
    [new Error("File not found"), "File not found (might have been deleted by the server)."],
    [new Error("Network unavailable"), "Failed to download file."],
  ])("reports a failed refresh without leaking the underlying exception", async (error, text) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("expired")));
    vi.mocked(mediaService.refreshMediaUrl).mockRejectedValue(error);
    show([attachment("document")]);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(text, { id: "download-failed" }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("marks a removed attachment in history when the refresh endpoint returns 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("download unavailable")));
    vi.mocked(mediaService.refreshMediaUrl).mockRejectedValue({
      isAxiosError: true,
      response: { status: 403 },
    });
    show([attachment("document")]);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Attachment has been deleted"));
    expect(query.client.getQueryData(["messages", "chat1"])).toMatchObject({
      pages: [{ data: [{ attachments: [{ id: "document", is_deleted: true }] }] }],
    });
  });

  it("refreshes a broken image once and displays a failure placeholder if refresh fails", async () => {
    vi.mocked(mediaService.refreshMediaUrl).mockRejectedValue(new Error("offline"));
    const { container } = show([attachment("photo", "image/png")]);
    fireEvent.error(screen.getByRole("img", { name: "photo.png" }));
    await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
    expect(container.querySelector("svg.lucide-image-off")).not.toBeNull();
    expect(mediaService.refreshMediaUrl).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2, 3, 5])(
    "opens the selected image from a %i-image gallery and closes it",
    async (count) => {
      const images = Array.from({ length: count }, (_, index) =>
        attachment(`photo-${index}`, "image/png")
      );
      show(images);
      const lastImage = screen.getByRole("img", { name: `photo-${count - 1}.png` });
      fireEvent.load(lastImage);
      fireEvent.click(lastImage);
      expect(await screen.findByRole("button", { name: "Close" })).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
      );
    }
  );
});
