import api from "@/lib/axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaService } from "../media.service";

vi.mock("@/lib/axios", () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: mockApi, api: mockApi };
});

const mockApi = vi.mocked(api);

describe("mediaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("creates a pending media upload, uploads to storage, then completes media", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    const completedMedia = {
      id: "media-1",
      url: "https://cdn.example.com/hello.txt",
      file_name: "media-1.txt",
      original_name: "hello.txt",
      mime_type: "text/plain",
      file_size: 5,
      category: "message_attachment",
      upload_status: "completed",
    };

    mockApi.post
      .mockResolvedValueOnce({
        data: {
          data: {
            media: { ...completedMedia, upload_status: "pending" },
            upload_url: "https://storage.example.com/upload",
            upload_method: "PUT",
            upload_headers: { "Content-Type": "text/plain" },
            expires_at: "2026-06-28T00:00:00Z",
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: completedMedia } });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    const result = await mediaService.uploadDirectMedia(file, {
      usage: "message_attachment",
      captchaToken: "captcha-token",
    });

    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      "/api/media/upload",
      {
        usage: "message_attachment",
        original_name: "hello.txt",
        file_size: 5,
        mime_type: "text/plain",
        captcha_token: "captcha-token",
      },
      { signal: undefined }
    );
    expect(fetch).toHaveBeenCalledWith("https://storage.example.com/upload", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: file,
      signal: undefined,
    });
    expect(mockApi.post).toHaveBeenNthCalledWith(2, "/api/media/media-1/complete", undefined, {
      signal: undefined,
    });
    expect(result).toEqual(completedMedia);
  });

  it("does not complete media when storage upload fails", async () => {
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    mockApi.post.mockResolvedValueOnce({
      data: {
        data: {
          media: { id: "media-1" },
          upload_url: "https://storage.example.com/upload",
          upload_method: "PUT",
          upload_headers: {},
          expires_at: "2026-06-28T00:00:00Z",
        },
      },
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as Response);

    await expect(
      mediaService.uploadDirectMedia(file, {
        usage: "message_attachment",
        captchaToken: "captcha-token",
      })
    ).rejects.toThrow("Storage upload failed: 403 Forbidden");

    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it("falls back to application/octet-stream when browser does not provide a MIME type", async () => {
    const file = new File(["binary"], "unknown.bin");
    const completedMedia = {
      id: "media-1",
      url: "https://cdn.example.com/unknown.bin",
      file_name: "media-1.bin",
      original_name: "unknown.bin",
      mime_type: "application/octet-stream",
      file_size: 6,
      category: "message_attachment",
      upload_status: "completed",
    };

    mockApi.post
      .mockResolvedValueOnce({
        data: {
          data: {
            media: { ...completedMedia, upload_status: "pending" },
            upload_url: "https://storage.example.com/upload",
            upload_method: "PUT",
            upload_headers: { "Content-Type": "application/octet-stream" },
            expires_at: "2026-06-28T00:00:00Z",
          },
        },
      })
      .mockResolvedValueOnce({ data: { data: completedMedia } });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await mediaService.uploadDirectMedia(file, {
      usage: "message_attachment",
      captchaToken: "captcha-token",
    });

    expect(mockApi.post).toHaveBeenNthCalledWith(
      1,
      "/api/media/upload",
      expect.objectContaining({
        mime_type: "application/octet-stream",
      }),
      { signal: undefined }
    );
  });
});
