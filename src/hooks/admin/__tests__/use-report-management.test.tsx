import { adminService } from "@/services/admin.service";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useReportManagement } from "../use-report-management";

vi.mock("@/services/admin.service", () => ({ adminService: { getReports: vi.fn() } }));
const first = {
  data: [{ id: "r1", status: "pending" }],
  meta: { has_next: true, next_cursor: "next" },
};
const last = { data: [{ id: "r2", status: "resolved" }], meta: { has_next: false } };

describe("admin report filters and cursor history", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(adminService.getReports).mockImplementation(
      async (params) => (params.cursor ? last : first) as never
    );
  });
  afterEach(() => context.client.clear());
  const setup = () => renderHook(useReportManagement, context);

  it("loads ten reports with no status restriction and navigates cursor history safely", async () => {
    const { result } = setup();
    expect(result.current.reports).toEqual([]);
    await waitFor(() => expect(result.current.reports).toEqual(first.data));
    expect(adminService.getReports).toHaveBeenCalledWith({
      status: undefined,
      limit: 10,
      cursor: undefined,
      query: undefined,
    });
    act(() => result.current.pagination.handleNextPage());
    await waitFor(() => expect(result.current.reports).toEqual(last.data));
    expect(result.current.pagination.cursorStack).toEqual([""]);
    act(() => result.current.pagination.handleNextPage());
    expect(result.current.pagination.cursor).toBe("next");
    act(() => result.current.pagination.handlePrevPage());
    await waitFor(() => expect(result.current.reports).toEqual(first.data));
    expect(result.current.pagination.cursor).toBeUndefined();
    act(() => result.current.pagination.handlePrevPage());
    expect(result.current.pagination.cursorStack).toEqual([]);
  });

  it("sends the selected status and only the final debounced search value", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.reports).toEqual(first.data));
    act(() => result.current.filterState.setStatusFilter("resolved"));
    await waitFor(() =>
      expect(adminService.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ status: "resolved" })
      )
    );
    act(() => result.current.filterState.setSearch("sp"));
    act(() => result.current.filterState.setSearch("spam"));
    expect(result.current.filterState.search).toBe("spam");
    expect(adminService.getReports).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: "sp" })
    );
    await waitFor(() =>
      expect(adminService.getReports).toHaveBeenCalledWith({
        status: "resolved",
        limit: 10,
        cursor: undefined,
        query: "spam",
      })
    );
    act(() => result.current.filterState.setStatusFilter("all"));
    await waitFor(() =>
      expect(adminService.getReports).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined, query: "spam" })
      )
    );
    act(() => result.current.filterState.setSearch(""));
    await waitFor(() =>
      expect(adminService.getReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: undefined, query: undefined })
      )
    );
  });

  it("exposes an error and recovers through the public refetch action", async () => {
    vi.mocked(adminService.getReports).mockRejectedValueOnce(new Error("offline"));
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("offline");
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.reports).toEqual(first.data));
    expect(result.current.isError).toBe(false);
  });

  it("does not advance when the response has no usable cursor", async () => {
    vi.mocked(adminService.getReports).mockResolvedValue({
      data: [],
      meta: { has_next: true },
    } as never);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.pagination.handleNextPage());
    expect(result.current.pagination.cursor).toBeUndefined();
    expect(result.current.pagination.cursorStack).toEqual([]);
    expect(adminService.getReports).toHaveBeenCalledOnce();
  });
});
