import { adminService } from "@/services/admin.service";
import { reportService } from "@/services/report.service";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import Reports from "../reports";

vi.mock("@/services/admin.service", () => ({
  adminService: {
    getReports: vi.fn(),
    getReportDetail: vi.fn(),
    resolveReport: vi.fn(),
    getUser: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    resetUserInfo: vi.fn(),
  },
}));
vi.mock("@/services/report.service", () => ({ reportService: { deleteReport: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
const report = {
  id: "r1",
  reason: "Abuse",
  target_type: "message",
  reporter_name: "Ada",
  status: "pending",
  created_at: "2026-01-02T12:00:00Z",
};

describe("admin report page integration", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    vi.mocked(adminService.getReports).mockResolvedValue({
      data: [report],
      meta: { has_next: false },
    } as never);
    vi.mocked(adminService.resolveReport).mockResolvedValue(undefined);
    vi.mocked(reportService.deleteReport).mockResolvedValue(undefined);
    vi.mocked(adminService.getUser).mockResolvedValue({
      id: "u2",
      full_name: "Grace Hopper",
      username: "grace",
      email: "grace@example.com",
    } as never);
    vi.mocked(adminService.banUser).mockResolvedValue(undefined);
    vi.mocked(adminService.unbanUser).mockResolvedValue(undefined);
    vi.mocked(adminService.resetUserInfo).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup() {
    render(
      <MemoryRouter>
        <Reports />
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  async function menu(action: string) {
    await screen.findByText("Ada");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Open menu" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByRole("menuitem", { name: action }));
  }
  it.each(["Resolve", "Reject"])(
    "submits the selected report and moderator notes through %s",
    async (action) => {
      setup();
      await menu(action);
      const dialog = await screen.findByRole("dialog", { name: `${action} Report` });
      fireEvent.change(within(dialog).getByRole("textbox"), {
        target: { value: "Reviewed evidence" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: `${action} Report` }));
      await waitFor(() =>
        expect(adminService.resolveReport).toHaveBeenCalledWith("r1", {
          status: action === "Resolve" ? "resolved" : "rejected",
          notes: "Reviewed evidence",
        })
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
  );
  it("deletes a rejected report only after confirmation", async () => {
    vi.mocked(adminService.getReports).mockResolvedValue({
      data: [{ ...report, status: "rejected" }],
      meta: {},
    } as never);
    setup();
    await menu("Delete");
    const dialog = await screen.findByRole("dialog");
    expect(reportService.deleteReport).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(reportService.deleteReport).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it.each(["Resolve", "Reject"])(
    "opens %s from the report detail rather than the listing menu",
    async (action) => {
      vi.mocked(adminService.getReportDetail).mockResolvedValue({
        ...report,
        reporter_id: "u2",
        target_type: "user",
        target_id: "u2",
      } as never);
      setup();
      await menu("View Details");
      const detail = await screen.findByRole("dialog", { name: /Report Detail/ });
      fireEvent.click(within(detail).getByRole("button", { name: action, exact: true }));
      const confirmation = await screen.findByRole("dialog", { name: `${action} Report` });
      fireEvent.click(within(confirmation).getByRole("button", { name: `${action} Report` }));
      await waitFor(() =>
        expect(adminService.resolveReport).toHaveBeenCalledWith("r1", {
          status: action === "Resolve" ? "resolved" : "rejected",
          notes: "",
        })
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: `${action} Report` })).not.toBeInTheDocument()
      );
    }
  );
  it.each(["Ban", "Unban", "Reset", "Details"])(
    "forwards %s from a reported user's real detail card",
    async (action) => {
      vi.mocked(adminService.getReportDetail).mockResolvedValue({
        ...report,
        reporter_id: "u2",
        reporter_is_banned: action === "Unban",
        target_type: "user",
        target_id: "u2",
        target_is_banned: action === "Unban",
      } as never);
      setup();
      await menu("View Details");
      const detail = await screen.findByRole("dialog", { name: /Report Detail/ });
      const controls = await within(detail).findAllByRole("button", { name: action, exact: true });
      fireEvent.click(controls[0]);
      if (action === "Details") {
        expect(await screen.findByText("grace@example.com")).toBeVisible();
      } else if (action === "Reset") {
        const dialog = await screen.findByRole("dialog", { name: "Reset User Info" });
        fireEvent.click(within(dialog).getByLabelText("Reset Bio"));
        fireEvent.click(within(dialog).getByRole("button", { name: "Reset Info" }));
        await waitFor(() =>
          expect(adminService.resetUserInfo).toHaveBeenCalledWith(
            "u2",
            expect.objectContaining({ reset_bio: true })
          )
        );
      } else if (action === "Ban") {
        const dialog = await screen.findByRole("dialog", { name: "Ban User" });
        fireEvent.change(within(dialog).getByLabelText("Reason for ban *"), {
          target: { value: "Reviewed abuse" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "Ban User" }));
        await waitFor(() =>
          expect(adminService.banUser).toHaveBeenCalledWith(
            expect.objectContaining({ target_user_id: "u2", reason: "Reviewed abuse" }),
            expect.anything()
          )
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog", { name: "Ban User" })).not.toBeInTheDocument()
        );
      } else {
        const dialog = await screen.findByRole("dialog", { name: "Unban User" });
        fireEvent.click(within(dialog).getByRole("button", { name: "Unban User" }));
        await waitFor(() =>
          expect(adminService.unbanUser).toHaveBeenCalledWith("u2", expect.anything())
        );
        await waitFor(() =>
          expect(screen.queryByRole("dialog", { name: "Unban User" })).not.toBeInTheDocument()
        );
      }
    }
  );
  it("debounces search and refreshes the listing without opening an action dialog", async () => {
    setup();
    await screen.findByText("Ada");
    fireEvent.change(screen.getByPlaceholderText("Search reports..."), {
      target: { value: "abuse" },
    });
    await waitFor(
      () =>
        expect(adminService.getReports).toHaveBeenLastCalledWith(
          expect.objectContaining({ query: "abuse" })
        ),
      { timeout: 1500 }
    );
    await screen.findByText("Ada");
    const before = vi.mocked(adminService.getReports).mock.calls.length;
    fireEvent.click(document.querySelector("button:has(svg.lucide-rotate-ccw)")!);
    await waitFor(() => expect(adminService.getReports).toHaveBeenCalledTimes(before + 1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
