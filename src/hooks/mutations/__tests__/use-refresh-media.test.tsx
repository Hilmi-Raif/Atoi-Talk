import { toast } from "@/lib/toast";
import { mediaService } from "@/services/media.service";
import { act, cleanup, renderHook } from "@testing-library/react";
import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useRefreshMedia } from "../use-refresh-media";

vi.mock("@/services/media.service", () => ({ mediaService: { refreshMediaUrl: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));

describe("media refresh cache reconciliation", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  it.each([false, true])(
    "updates only the requested attachment across message pages (deleted=%s)",
    async (deleted) => {
      const attachment = { id: "media", url: "/expired" };
      const window = {
        pages: [
          {
            data: [
              { id: "target", attachments: [attachment, { id: "other", url: "/keep" }] },
              { id: "no-attachments", attachments: null },
              { id: "unrelated", attachments: [attachment] },
            ],
          },
          { data: [{ id: "target", attachments: null }] },
        ],
        pageParams: [],
      };
      context.client.setQueryData(["messages", "chat"], window);
      context.client.setQueryData(["messages", "another"], window);
      if (deleted)
        vi.mocked(mediaService.refreshMediaUrl).mockRejectedValueOnce(
          new AxiosError("Deleted", undefined, undefined, undefined, { status: 403 } as never)
        );
      else vi.mocked(mediaService.refreshMediaUrl).mockResolvedValueOnce("/renewed");
      const { result } = renderHook(() => useRefreshMedia("chat"), context);
      await act(() => result.current.mutateAsync({ mediaId: "media", messageId: "target" }));
      expect(context.client.getQueryData(["messages", "chat"])).toMatchObject({
        pages: [
          {
            data: [
              {
                id: "target",
                attachments: [
                  deleted ? { ...attachment, is_deleted: true } : { id: "media", url: "/renewed" },
                  { id: "other", url: "/keep" },
                ],
              },
              { id: "no-attachments", attachments: null },
              { id: "unrelated", attachments: [attachment] },
            ],
          },
          { data: [{ id: "target", attachments: null }] },
        ],
      });
      expect(context.client.getQueryData(["messages", "another"])).toEqual(window);
      if (deleted) expect(toast.error).toHaveBeenCalledWith("Attachment has been deleted");
      else expect(toast.error).not.toHaveBeenCalled();
    }
  );
  it.each([false, true])(
    "does not create an absent history cache (deleted=%s)",
    async (deleted) => {
      if (deleted)
        vi.mocked(mediaService.refreshMediaUrl).mockRejectedValueOnce(
          new AxiosError("Deleted", undefined, undefined, undefined, { status: 403 } as never)
        );
      else vi.mocked(mediaService.refreshMediaUrl).mockResolvedValueOnce("/renewed");
      const { result } = renderHook(() => useRefreshMedia("chat"), context);
      await act(() => result.current.mutateAsync({ mediaId: "media", messageId: "target" }));
      expect(context.client.getQueryData(["messages", "chat"])).toBeUndefined();
    }
  );
  it.each([
    new Error("offline"),
    new AxiosError("Server failed", undefined, undefined, undefined, { status: 500 } as never),
  ])("retains cached media after a transient refresh failure %s", async (error) => {
    const before = {
      pages: [{ data: [{ id: "target", attachments: [{ id: "media", url: "/expired" }] }] }],
      pageParams: [],
    };
    context.client.setQueryData(["messages", "chat"], before);
    vi.mocked(mediaService.refreshMediaUrl).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useRefreshMedia("chat"), context);
    await act(async () => {
      await expect(
        result.current.mutateAsync({ mediaId: "media", messageId: "target" })
      ).rejects.toBe(error);
    });
    expect(context.client.getQueryData(["messages", "chat"])).toEqual(before);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
