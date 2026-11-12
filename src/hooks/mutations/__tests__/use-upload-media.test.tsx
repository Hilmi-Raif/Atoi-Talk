import { errorLog } from "@/lib/logger";
import { mediaService } from "@/services/media.service";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useUploadMedia } from "../use-upload-media";

vi.mock("@/services/media.service", () => ({ mediaService: { uploadDirectMedia: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
describe("media upload mutation", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  it("passes the file, usage, security token and cancellation signal to direct upload", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    const signal = new AbortController().signal;
    const media = { id: "m1", original_name: file.name };
    vi.mocked(mediaService.uploadDirectMedia).mockResolvedValue(media as never);
    const { result } = renderHook(() => useUploadMedia(), context);
    await act(async () => {
      expect(
        await result.current.mutateAsync({
          file,
          usage: "message_attachment",
          captchaToken: "verified",
          signal,
        })
      ).toEqual(media);
    });
    expect(mediaService.uploadDirectMedia).toHaveBeenCalledWith(file, {
      usage: "message_attachment",
      captchaToken: "verified",
      signal,
    });
  });
  it.each([
    { name: "Aborted", message: "cancelled" },
    { name: "Error", message: "aborted" },
    { name: "CanceledError", message: "cancelled" },
    { name: "Error", message: "storage unavailable" },
  ])("rejects %j without logging expected cancellation as a storage failure", async (failure) => {
    vi.mocked(mediaService.uploadDirectMedia).mockRejectedValue(failure);
    const { result } = renderHook(() => useUploadMedia(), context);
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          file: new File([], "a"),
          usage: "message_attachment",
          captchaToken: "verified",
        })
      ).rejects.toEqual(failure);
    });
    if (failure.message === "storage unavailable")
      expect(errorLog).toHaveBeenCalledWith("Upload failed in mutation:", failure);
    else expect(errorLog).not.toHaveBeenCalled();
  });
});
