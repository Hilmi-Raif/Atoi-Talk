import { adminService } from "@/services";
import { useUIStore } from "@/store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import AdminDashboard from "../dashboard";
vi.mock("@/services", () => ({ adminService: { getDashboardStats: vi.fn() } }));
function Location() {
  return <output>{useLocation().pathname}</output>;
}
describe("admin dashboard", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useUIStore.getState().reset();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useUIStore.getState().reset();
  });
  function setup() {
    return render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Location />
        <Routes>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/:page" element={<h1>Management destination</h1>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  it("shows loading placeholders and disables refresh until statistics arrive", async () => {
    let complete!: (value: unknown) => void;
    vi.mocked(adminService.getDashboardStats).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve as typeof complete;
        }) as never
    );
    const { container } = setup();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    complete({ total_users: 1234, total_messages: 5000, total_groups: 12, active_reports: 3 });
    expect(await screen.findByText((1234).toLocaleString())).toBeVisible();
    await waitFor(() => expect(useUIStore.getState().globalLoading).toBe(false));
    expect(screen.getByRole("button")).toBeEnabled();
  });
  it.each([
    ["Total Users", "/admin/users"],
    ["Total Messages", "/admin/dashboard"],
    ["Active Groups", "/admin/groups"],
    ["Active Reports", "/admin/reports"],
  ])("opens the %s management destination", async (title, path) => {
    vi.mocked(adminService.getDashboardStats).mockResolvedValue({} as never);
    setup();
    await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
    expect(screen.getAllByText("0")).toHaveLength(4);
    fireEvent.click(screen.getByText(title));
    expect(screen.getByRole("status")).toHaveTextContent(path);
  });
  it("prevents error cards from navigating and retries without propagating the click", async () => {
    vi.mocked(adminService.getDashboardStats)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ total_users: 8 } as never);
    setup();
    expect(await screen.findAllByText("Failed to load")).toHaveLength(4);
    fireEvent.click(screen.getByText("Total Users"));
    expect(screen.getByRole("status")).toHaveTextContent("/admin/dashboard");
    fireEvent.click(screen.getAllByRole("button", { name: "Try Again" })[0]);
    expect(await screen.findByText("8")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("/admin/dashboard");
  });
  it("refreshes statistics from the header control", async () => {
    vi.mocked(adminService.getDashboardStats)
      .mockResolvedValueOnce({ total_users: 1 } as never)
      .mockResolvedValue({ total_users: 2 } as never);
    setup();
    await screen.findByText("1");
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("2")).toBeVisible();
  });
});
