import { toast } from "@/lib/toast";
import { adminService, type ReportListResponse } from "@/services/admin.service";
import { reportService } from "@/services/report.service";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useReportActions } from "../use-report-actions";

vi.mock("@/services/admin.service", () => ({
  adminService: { getReportDetail: vi.fn(), resolveReport: vi.fn() },
}));
vi.mock("@/services/report.service", () => ({ reportService: { deleteReport: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
let query: ReturnType<typeof createQueryWrapper>;
function setup() {
  return renderHook(useReportActions, { wrapper: query.wrapper });
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
});
afterEach(() => query.client.clear());

describe("useReportActions", () => {
  it("does not fetch or mutate without a selected report", () => {
    const { result } = setup();
    act(() => {
      result.current.actionState.handleResolve();
      result.current.actionState.handleReject();
      result.current.deleteState.handleDeleteReport();
    });
    expect(adminService.getReportDetail).not.toHaveBeenCalled();
    expect(adminService.resolveReport).not.toHaveBeenCalled();
    expect(reportService.deleteReport).not.toHaveBeenCalled();
  });
  it("loads report details before opening the dialog and shares the observed detail cache", async () => {
    const detail = { id: "r1", status: "pending" };
    vi.mocked(adminService.getReportDetail).mockResolvedValue(detail as never);
    const { result } = setup();
    await act(async () => {
      await result.current.detailState.handleViewDetail("r1");
    });
    expect(result.current.detailState).toMatchObject({
      detailReportId: "r1",
      detailOpen: true,
      isFetchingDetail: false,
      reportDetail: detail,
    });
    expect(query.client.getQueryData(["admin-report-detail", "r1"])).toEqual(detail);
    await act(async () => {
      await result.current.detailState.handleViewDetail("r1");
    });
    // enabling a stale observer triggers a background refresh
    expect(adminService.getReportDetail).toHaveBeenCalledWith("r1");
    expect(result.current.detailState.reportDetail).toEqual(detail);
  });
  it("shows a loading state while details are pending", async () => {
    let finish!: (value: never) => void;
    vi.mocked(adminService.getReportDetail).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { result } = setup();
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.detailState.handleViewDetail("r1");
    });
    expect(result.current.detailState.isFetchingDetail).toBe(true);
    expect(result.current.detailState.detailOpen).toBe(false);
    await act(async () => {
      finish({ id: "r1" } as never);
      await pending;
    });
    expect(result.current.detailState.isFetchingDetail).toBe(false);
    expect(result.current.detailState.detailOpen).toBe(true);
  });
  it("keeps the detail dialog closed when fetching fails", async () => {
    vi.mocked(adminService.getReportDetail).mockRejectedValue(new Error("offline"));
    const { result } = setup();
    await act(async () => {
      await result.current.detailState.handleViewDetail("r1");
    });
    expect(toast.error).toHaveBeenCalledWith("Failed to load report details");
    expect(result.current.detailState).toMatchObject({
      detailReportId: null,
      detailOpen: false,
      isFetchingDetail: false,
    });
  });
  it.each(["resolved", "rejected"] as const)(
    "submits %s with notes, invalidates lists and closes dialogs",
    async (status) => {
      vi.mocked(adminService.resolveReport).mockResolvedValue(undefined as never);
      query.client.setQueryData(["admin-reports", "pending"], { data: [{ id: "r1" }] });
      query.client.setQueryData(["unrelated"], true);
      const { result } = setup();
      act(() => {
        result.current.actionState.setSelectedReport({ id: "r1" } as ReportListResponse);
        result.current.actionState.setResolveNotes("Reviewed evidence");
        result.current.actionState.setResolveOpen(true);
        result.current.actionState.setRejectOpen(true);
        result.current.detailState.setDetailOpen(true);
      });
      act(() => {
        if (status === "resolved") result.current.actionState.handleResolve();
        else result.current.actionState.handleReject();
      });
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith("Report updated successfully")
      );
      expect(adminService.resolveReport).toHaveBeenCalledWith("r1", {
        status,
        notes: "Reviewed evidence",
      });
      expect(query.client.getQueryState(["admin-reports", "pending"])?.isInvalidated).toBe(true);
      expect(query.client.getQueryState(["unrelated"])?.isInvalidated).toBe(false);
      expect(result.current.actionState).toMatchObject({
        resolveOpen: false,
        rejectOpen: false,
        resolveNotes: "",
        isPending: false,
      });
      expect(result.current.detailState.detailOpen).toBe(false);
    }
  );
  it("preserves notes and the action dialog when resolving fails", async () => {
    vi.mocked(adminService.resolveReport).mockRejectedValue(new Error("offline"));
    const { result } = setup();
    act(() => {
      result.current.actionState.setSelectedReport({ id: "r1" } as ReportListResponse);
      result.current.actionState.setResolveNotes("Keep notes");
      result.current.actionState.setResolveOpen(true);
    });
    act(() => result.current.actionState.handleResolve());
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to update report"));
    expect(result.current.actionState).toMatchObject({
      resolveOpen: true,
      resolveNotes: "Keep notes",
      isPending: false,
    });
  });
  it("deletes the selected report and resets its confirmation state", async () => {
    vi.mocked(reportService.deleteReport).mockResolvedValue(undefined);
    query.client.setQueryData(["admin-reports"], []);
    const { result } = setup();
    act(() => {
      result.current.deleteState.setDeleteReportId("r1");
      result.current.deleteState.setDeleteOpen(true);
    });
    act(() => result.current.deleteState.handleDeleteReport());
    await waitFor(() => expect(result.current.deleteState.deleteOpen).toBe(false));
    expect(reportService.deleteReport).toHaveBeenCalledWith("r1");
    expect(result.current.deleteState.deleteReportId).toBeNull();
    expect(query.client.getQueryState(["admin-reports"])?.isInvalidated).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Report deleted successfully");
  });
  it.each(["Report already removed", undefined])(
    "preserves deletion confirmation after failure (%s)",
    async (error) => {
      vi.mocked(reportService.deleteReport).mockRejectedValue({ response: { data: { error } } });
      const { result } = setup();
      act(() => {
        result.current.deleteState.setDeleteReportId("r1");
        result.current.deleteState.setDeleteOpen(true);
      });
      act(() => result.current.deleteState.handleDeleteReport());
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(error || "Failed to delete report")
      );
      expect(result.current.deleteState).toMatchObject({
        deleteReportId: "r1",
        deleteOpen: true,
        isDeletePending: false,
      });
    }
  );
});
