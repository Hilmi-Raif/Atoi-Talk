import { toast } from "@/lib/toast";
import type { ReportDetailResponse } from "@/services/admin.service";
import { mediaService } from "@/services/media.service";
import type { Media } from "@/types";
import { act, renderHook } from "@testing-library/react";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useReportMedia } from "../use-report-media";

vi.mock("@/services/media.service", () => ({ mediaService: { refreshMediaUrl: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const image = {
  id,
  url: "https://storage/old.png",
  mime_type: "image/png",
  original_name: "photo.png",
} as Media;
const report = (snapshot: unknown) => ({ evidence_snapshot: snapshot }) as ReportDetailResponse;

describe("report evidence media", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    class TestURL extends URL {
      static createObjectURL = vi.fn(() => "blob:download");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", TestURL);
    vi.mocked(mediaService.refreshMediaUrl).mockResolvedValue("https://storage/refreshed.png");
  });
  afterEach(() => {
    context.client.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const setup = (detail: ReportDetailResponse | undefined, reportId: string | null = "r1") => {
    if (detail) context.client.setQueryData(["admin-report-detail", "r1"], detail);
    return renderHook(() => useReportMedia(detail, reportId), context);
  };

  it("handles absent evidence without inventing attachments", () => {
    const { result } = setup(undefined);
    expect(result.current.images).toEqual([]);
    expect(result.current.files).toEqual([]);
    expect(result.current.slides).toEqual([]);
  });

  it("normalizes legacy URLs and separates image slides from file evidence", () => {
    const { result } = setup(
      report({
        data: {
          attachments: [
            `https://storage/${id}/PHOTO.PNG?signature=old`,
            "https://storage/manual.pdf",
            image,
          ],
        },
      })
    );
    expect(result.current.images).toHaveLength(2);
    expect(result.current.images[0]).toMatchObject({
      id,
      original_name: "PHOTO.PNG",
      mime_type: "image/jpeg",
    });
    expect(result.current.files[0]).toMatchObject({ id: "att-1", original_name: "manual.pdf" });
    expect(result.current.slides[1]).toEqual({ src: image.url, alt: "photo.png", mediaId: id });
  });

  it.each([false, true])(
    "refreshes matching object and legacy URLs in nested evidence %s",
    async (nested) => {
      const attachments = [image, `https://storage/${id}.png`, "https://storage/unrelated.pdf"];
      const detail = report(
        nested ? { data: { attachments, retained: true } } : { attachments, retained: true }
      );
      const { result } = setup(detail);
      await act(async () =>
        expect(await result.current.handleAttachmentRefresh(id)).toBe(
          "https://storage/refreshed.png"
        )
      );
      const cached = context.client.getQueryData<ReportDetailResponse>([
        "admin-report-detail",
        "r1",
      ])!;
      const snapshot = cached.evidence_snapshot!;
      const updated = nested ? snapshot.data!.attachments : snapshot.attachments;
      expect(updated).toEqual([
        { ...image, url: "https://storage/refreshed.png" },
        "https://storage/refreshed.png",
        "https://storage/unrelated.pdf",
      ]);
      expect(detail.evidence_snapshot).not.toEqual(cached.evidence_snapshot);
    }
  );

  it.each(["", "att-0"])("rejects unrefreshable attachment ID %s", async (invalid) => {
    const { result } = setup(report({ attachments: [image] }));
    await expect(result.current.handleAttachmentRefresh(invalid)).rejects.toThrow("missing ID");
    expect(mediaService.refreshMediaUrl).not.toHaveBeenCalled();
  });

  it("does not refresh without an open report", async () => {
    const { result } = setup(undefined, null);
    expect(await result.current.handleAttachmentRefresh(id)).toBe("");
    expect(mediaService.refreshMediaUrl).not.toHaveBeenCalled();
  });

  it("preserves evidence and explains a deleted attachment on forbidden refresh", async () => {
    const detail = report({ attachments: [image] });
    const error = new AxiosError("Forbidden");
    error.response = { status: 403 } as never;
    vi.mocked(mediaService.refreshMediaUrl).mockRejectedValue(error);
    const { result } = setup(detail);
    await expect(result.current.handleAttachmentRefresh(id)).rejects.toBe(error);
    expect(context.client.getQueryData(["admin-report-detail", "r1"])).toEqual(detail);
    expect(toast.error).toHaveBeenCalledWith("Attachment has been deleted");
  });

  it("downloads the blob, names the anchor, and releases its object URL", async () => {
    fetchMock.mockResolvedValue(new Response("file bytes"));
    const { result } = setup(report({ attachments: [image] }));
    const click = vi.mocked(HTMLAnchorElement.prototype.click);
    await act(() => result.current.handleDownload(image));
    expect(fetchMock).toHaveBeenCalledWith(image.url);
    expect(click.mock.instances[0].download).toBe("photo.png");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
    expect(document.querySelector('a[download="photo.png"]')).toBeNull();
  });

  it("refreshes an expired download URL once then downloads the new URL", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("expired", { status: 403, statusText: "Forbidden" }))
      .mockResolvedValueOnce(new Response("bytes"));
    const { result } = setup(report({ attachments: [image] }));
    await act(() => result.current.handleDownload(image));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      image.url,
      "https://storage/refreshed.png",
    ]);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each(["File not found", "Storage offline"])(
    "reports final download failure: %s",
    async (reason) => {
      fetchMock.mockRejectedValue(new Error("Network"));
      vi.mocked(mediaService.refreshMediaUrl).mockRejectedValue(new Error(reason));
      const { result } = setup(report({ attachments: [image] }));
      await act(() => result.current.handleDownload(image));
      expect(toast.error).toHaveBeenCalledWith(
        reason === "File not found"
          ? "File not found (might have been deleted by the server)."
          : "Failed to download file.",
        { id: "download-failed" }
      );
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    }
  );

  it("ignores files without URLs", async () => {
    const { result } = setup(undefined);
    await result.current.handleDownload({ ...image, url: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps unnamed legacy evidence and media without a MIME type downloadable", () => {
    const unknown = { id: "unknown", url: "/file" } as Media;
    const { result } = setup(report({ attachments: ["https://storage/", unknown] }));
    expect(result.current.files).toEqual([
      expect.objectContaining({ id: "att-0", original_name: "attachment" }),
      unknown,
    ]);
    expect(result.current.images).toEqual([]);
  });

  it.each([undefined, {}, { evidence_snapshot: {} }])(
    "does not invent evidence when refreshing a report without cached attachments %j",
    async (cached) => {
      const { result } = setup(undefined);
      if (cached) context.client.setQueryData(["admin-report-detail", "r1"], cached);
      await expect(result.current.handleAttachmentRefresh(id)).resolves.toBe(
        "https://storage/refreshed.png"
      );
      expect(context.client.getQueryData(["admin-report-detail", "r1"])).toEqual(cached);
    }
  );

  it.each([
    { original_name: "", file_name: "stored.pdf", expected: "stored.pdf" },
    { original_name: "", file_name: "", expected: "download" },
  ])("uses the available download filename %j", async ({ expected, ...names }) => {
    fetchMock.mockResolvedValue(new Response("bytes"));
    const { result } = setup(undefined);
    await act(() => result.current.handleDownload({ ...image, ...names }));
    expect(vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0].download).toBe(expected);
  });

  it("reports a failed download without a selected report instead of retrying an empty URL", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { result } = setup(undefined, null);
    await act(() => result.current.handleDownload(image));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mediaService.refreshMediaUrl).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Failed to download file.", { id: "download-failed" });
  });
});
