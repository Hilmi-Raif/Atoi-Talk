import { toast } from "@/lib/toast";
import type { Media } from "@/types";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatUpload } from "../use-chat-upload";

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ debugLog: vi.fn(), errorLog: vi.fn() }));

const media: Media = {
  id: "media-1",
  url: "https://storage.example/file",
  file_name: "stored.txt",
  original_name: "notes.txt",
  mime_type: "text/plain",
  file_size: 5,
};
const file = () => new File(["hello"], "notes.txt", { type: "text/plain", lastModified: 1 });

function setup(initial: Media[] = []) {
  const uploadMedia =
    vi.fn<
      (variables: {
        file: File;
        usage: string;
        captchaToken: string;
        signal?: AbortSignal;
      }) => Promise<Media>
    >();
  const execute = vi.fn();
  const hook = renderHook(() => {
    const [attachments, setAttachments] = useState(initial);
    return { ...useChatUpload({ uploadMedia, attachments, setAttachments }), attachments };
  });
  hook.result.current.captchaRef.current = { execute, reset: vi.fn(), getResponse: () => "token" };
  return { ...hook, uploadMedia, execute };
}

describe("chat upload queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("queues a file once even when another selection occurs before rendering", async () => {
    const { result, execute } = setup();
    await act(async () => {
      await result.current.handleFilesChange([file()]);
      await result.current.handleFilesChange([file()]);
    });
    expect(result.current.uploadingFiles).toHaveLength(1);
    expect(result.current.isSolvingCaptcha).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("ignores an attachment with the same original name and size", async () => {
    const { result, execute } = setup([media]);
    await act(() => result.current.handleFilesChange([file()]));
    expect(result.current.uploadingFiles).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it("ignores a repeated rendered selection but accepts a different modification time", async () => {
    const { result } = setup();
    const first = file();
    await act(() => result.current.handleFilesChange([first]));
    await act(() => result.current.handleFilesChange([file()]));
    expect(result.current.uploadingFiles).toEqual([first]);
    const changed = new File(["hello"], "notes.txt", { lastModified: 2 });
    await act(() => result.current.handleFilesChange([changed]));
    expect(result.current.uploadingFiles).toEqual([first, changed]);
  });
  it.each([false, true])(
    "finishes one upload without removing a different queued file (failed=%s)",
    async (failed) => {
      const { result, uploadMedia } = setup();
      const first = file();
      const second = new File(["other"], "other.txt", { lastModified: 2 });
      if (failed) uploadMedia.mockRejectedValueOnce(new Error("offline"));
      else uploadMedia.mockResolvedValueOnce(media);
      await act(() => result.current.handleFilesChange([first, second]));
      await act(() => result.current.processNextFile("token"));
      expect(result.current.uploadingFiles).toEqual([second]);
      expect(result.current.isSolvingCaptcha).toBe(true);
    }
  );

  it("rejects files over 20 MiB and reports a bounded filename", async () => {
    const large = new File(["x"], "a-very-long-filename-for-an-upload.txt");
    Object.defineProperty(large, "size", { value: 20 * 1024 * 1024 + 1 });
    const { result, uploadMedia } = setup();
    await act(() => result.current.handleFilesChange([large]));
    act(() => vi.runOnlyPendingTimers());
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/^File ".*\.\.\..*\.txt" exceeds 20MB$/)
    );
    expect(result.current.uploadingFiles).toEqual([]);
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("accepts the exact size limit", async () => {
    const boundary = file();
    Object.defineProperty(boundary, "size", { value: 20 * 1024 * 1024 });
    const { result } = setup();
    await act(() => result.current.handleFilesChange([boundary]));
    expect(result.current.uploadingFiles).toEqual([boundary]);
  });

  it.each(["a-long-filename-without-an-extension", "a.filename-extension-that-is-too-long"])(
    "reports a failed upload without losing its filename shape for %s",
    async (name) => {
      const selected = new File(["hello"], name, { lastModified: 1 });
      const { result, uploadMedia } = setup();
      uploadMedia.mockRejectedValueOnce(new Error("storage unavailable"));
      await act(() => result.current.handleFilesChange([selected]));
      await act(() => result.current.processNextFile("token"));
      act(() => vi.runOnlyPendingTimers());
      const shown = vi.mocked(toast.error).mock.calls[0][0];
      expect(shown).toBe(
        name.includes(".") ? `Failed to upload "${name}"` : 'Failed to upload "a-long-f...xtension"'
      );
      expect(result.current.uploadingFiles).toEqual([]);
      expect(result.current.isSolvingCaptcha).toBe(false);
    }
  );

  it("cancels queued files before storage starts without requiring a CAPTCHA widget", async () => {
    const { result, uploadMedia } = setup();
    result.current.captchaRef.current = null;
    await act(() => result.current.handleFilesChange([file()]));
    act(() => result.current.handleCancelUploads());
    await act(() => result.current.processNextFile("late-token"));
    expect(result.current.pendingUploadsRef.current).toEqual([]);
    expect(result.current.uploadingFiles).toEqual([]);
    expect(uploadMedia).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.isCancelling).toBe(false);
  });

  it("uploads serially using a fresh CAPTCHA for each file and preserves existing attachments", async () => {
    const first = file();
    const second = new File(["other"], "second.txt");
    const existing = { ...media, id: "existing", original_name: "existing.txt" };
    const secondMedia = { ...media, id: "media-2", original_name: second.name };
    const { result, uploadMedia, execute } = setup([existing]);
    uploadMedia.mockResolvedValueOnce(media).mockResolvedValueOnce(secondMedia);
    await act(() => result.current.handleFilesChange([first, second]));
    await act(() => result.current.processNextFile("captcha-1"));
    expect(result.current.attachments).toEqual([existing, media]);
    expect(result.current.uploadingFiles).toEqual([second]);
    expect(execute).toHaveBeenCalledTimes(2);
    await act(() => result.current.processNextFile("captcha-2"));
    expect(uploadMedia).toHaveBeenNthCalledWith(1, {
      file: first,
      usage: "message_attachment",
      captchaToken: "captcha-1",
      signal: expect.any(AbortSignal),
    });
    expect(uploadMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ file: second, captchaToken: "captcha-2" })
    );
    expect(result.current.attachments).toEqual([existing, media, secondMedia]);
    expect(result.current.uploadingFiles).toEqual([]);
    expect(result.current.isSolvingCaptcha).toBe(false);
  });

  it("continues with the next file after a failed upload", async () => {
    const { result, uploadMedia, execute } = setup();
    const second = new File(["other"], "second.txt");
    uploadMedia
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(media);
    await act(() => result.current.handleFilesChange([file(), second]));
    await act(() => result.current.processNextFile("token"));
    act(() => vi.runOnlyPendingTimers());
    expect(toast.error).toHaveBeenCalledWith('Failed to upload "notes.txt"');
    expect(result.current.uploadingFiles).toEqual([second]);
    expect(execute).toHaveBeenCalledTimes(2);
    await act(() => result.current.processNextFile("new-token"));
    expect(result.current.attachments).toEqual([media]);
  });

  it("allows retrying a failed file", async () => {
    const { result, uploadMedia } = setup();
    uploadMedia.mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce(media);
    await act(() => result.current.handleFilesChange([file()]));
    await act(() => result.current.processNextFile("token"));
    await act(() => result.current.handleFilesChange([file()]));
    expect(result.current.uploadingFiles).toHaveLength(1);
    await act(() => result.current.processNextFile("retry-token"));
    expect(result.current.attachments).toEqual([media]);
  });

  it("discards a late success after cancellation and unlocks cancellation state after one second", async () => {
    let finish!: (value: Media) => void;
    const { result, uploadMedia } = setup();
    uploadMedia.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await act(() => result.current.handleFilesChange([file()]));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.processNextFile("token");
    });
    const signal = uploadMedia.mock.calls[0][0].signal!;
    act(() => result.current.handleCancelUploads());
    expect(signal.aborted).toBe(true);
    expect(result.current.isCancelling).toBe(true);
    expect(result.current.uploadingFiles).toEqual([]);
    await act(async () => {
      finish(media);
      await pending;
    });
    expect(result.current.attachments).toEqual([]);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.isCancelling).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not report an aborted request as an upload failure", async () => {
    let reject!: (reason: Error) => void;
    const { result, uploadMedia } = setup();
    uploadMedia.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    );
    await act(() => result.current.handleFilesChange([file()]));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.processNextFile("token");
    });
    act(() => result.current.handleCancelUploads());
    await act(async () => {
      reject(new Error("aborted"));
      await pending;
    });
    act(() => vi.runOnlyPendingTimers());
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.isSolvingCaptcha).toBe(false);
  });

  it("clears all pending files when CAPTCHA fails and allows a new selection", async () => {
    const { result } = setup();
    await act(() => result.current.handleFilesChange([file(), new File(["x"], "second")]));
    act(() => result.current.handleCaptchaError());
    act(() => vi.runOnlyPendingTimers());
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(result.current.uploadingFiles).toEqual([]);
    expect(result.current.isSolvingCaptcha).toBe(false);
    await act(() => result.current.handleFilesChange([file()]));
    expect(result.current.uploadingFiles).toHaveLength(1);
  });

  it("ignores a late CAPTCHA callback when the queue is empty", async () => {
    const { result, uploadMedia } = setup();
    await act(() => result.current.processNextFile("late-token"));
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(result.current.isSolvingCaptcha).toBe(false);
  });
});
