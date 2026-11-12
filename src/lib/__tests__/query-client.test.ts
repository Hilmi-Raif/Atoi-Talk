import { MutationObserver } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryClient } from "../query-client";

function failure(status?: number) {
  return new AxiosError(
    "request failed",
    undefined,
    undefined,
    undefined,
    status ? { status, data: {}, headers: {}, statusText: "error", config: {} as never } : undefined
  );
}

describe("application query retry policy", () => {
  afterEach(() => queryClient.clear());
  it.each([400, 401, 403, 404, 429])("does not retry query client errors (%s)", async (status) => {
    const error = failure(status);
    const queryFn = vi.fn().mockRejectedValue(error);
    await expect(
      queryClient.fetchQuery({ queryKey: ["retry-policy", status], queryFn, retryDelay: 0 })
    ).rejects.toBe(error);
    expect(queryFn).toHaveBeenCalledOnce();
  });
  it.each([failure(500), failure(503), failure(302), failure(), new Error("offline")])(
    "bounds transient query retries for %s",
    async (error) => {
      const queryFn = vi.fn().mockRejectedValue(error);
      await expect(
        queryClient.fetchQuery({ queryKey: ["retry-policy"], queryFn, retryDelay: 0 })
      ).rejects.toBe(error);
      expect(queryFn).toHaveBeenCalledTimes(4);
    }
  );
  it.each([400, 403, 429])("does not replay rejected mutations (%s)", async (status) => {
    const error = failure(status);
    const mutationFn = vi.fn().mockRejectedValue(error);
    const observer = new MutationObserver(queryClient, { mutationFn, retryDelay: 0 });
    await expect(observer.mutate()).rejects.toBe(error);
    expect(mutationFn).toHaveBeenCalledOnce();
  });
  it.each([failure(500), failure(302), failure(), new Error("offline")])(
    "limits transient mutation replay to one retry for %s",
    async (error) => {
      const mutationFn = vi.fn().mockRejectedValue(error);
      const observer = new MutationObserver(queryClient, { mutationFn, retryDelay: 0 });
      await expect(observer.mutate()).rejects.toBe(error);
      expect(mutationFn).toHaveBeenCalledTimes(2);
    }
  );
});
