import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportListTable } from "../reports/report-list-table";
type Props = ComponentProps<typeof ReportListTable>;
describe("report listing actions", () => {
  afterEach(cleanup);
  function setup(overrides: Partial<Props> = {}) {
    const props: Props = {
      reports: [],
      isLoading: false,
      isError: false,
      error: null,
      onRefetch: vi.fn(),
      onViewDetail: vi.fn(),
      onResolve: vi.fn(),
      onReject: vi.fn(),
      onDelete: vi.fn(),
      ...overrides,
    };
    return { ...render(<ReportListTable {...props} />), props };
  }
  it("renders loading rows before displaying an empty result", () => {
    const { container, props, rerender } = setup({ isLoading: true });
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(30);
    expect(screen.queryByText("No reports found.")).not.toBeInTheDocument();
    rerender(<ReportListTable {...props} isLoading={false} />);
    expect(screen.getByText("No reports found.")).toBeVisible();
  });
  it.each([new Error("Connection unavailable"), null])(
    "shows a recoverable listing failure for %s",
    (error) => {
      const { props } = setup({ isError: true, error });
      expect(
        screen.getByText(error ? error.message : "An unexpected error occurred")
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
      expect(props.onRefetch).toHaveBeenCalledOnce();
    }
  );
  it.each([
    ["pending", "user", "View Details"],
    ["pending", "group", "Resolve"],
    ["pending", "message", "Reject"],
    ["resolved", "user", "View Details"],
    ["rejected", "group", "Delete"],
  ])("offers the correct %s report action: %s / %s", async (status, target, action) => {
    const report = {
      id: "report-1",
      reason: "Abuse",
      target_type: target,
      reporter_name: "Ada",
      status,
      created_at: "2026-01-02T12:00:00Z",
    } as Props["reports"][number];
    const { props } = setup({ reports: [report] });
    expect(screen.getByText("Ada")).toBeVisible();
    expect(screen.getByText(status)).toBeVisible();
    expect(screen.getByText(target)).toBeVisible();
    expect(screen.getByText("Jan 2, 2026")).toBeVisible();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Open menu" }), {
      button: 0,
      ctrlKey: false,
    });
    const menu = await screen.findByRole("menu");
    expect(menu).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: status === "pending" ? "Delete" : "Resolve" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: action }));
    const handler =
      action === "View Details"
        ? props.onViewDetail
        : action === "Resolve"
          ? props.onResolve
          : action === "Reject"
            ? props.onReject
            : props.onDelete;
    expect(handler).toHaveBeenCalledWith(
      action === "Resolve" || action === "Reject" ? report : report.id
    );
  });
});
