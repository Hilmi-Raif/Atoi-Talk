import { adminService } from "@/services/admin.service";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useAdminGroups } from "../use-admin-groups";

vi.mock("@/services/admin.service", () => ({ adminService: { getGroups: vi.fn() } }));
const first = {
  data: [{ id: "g1", name: "First" }],
  meta: { has_next: true, next_cursor: "page2" },
};
const second = {
  data: [{ id: "g2", name: "Second" }],
  meta: { has_next: true, next_cursor: "page3" },
};
const last = { data: [{ id: "g3", name: "Last" }], meta: { has_next: false } };

describe("admin group paging", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(adminService.getGroups).mockImplementation(
      async (params) =>
        (params.cursor === "page2" ? second : params.cursor === "page3" ? last : first) as never
    );
  });
  afterEach(() => context.client.clear());
  const setup = () => renderHook(() => useAdminGroups(), { wrapper: context.wrapper });
  it("loads the first page and walks forward and back through cursor history", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.groups).toEqual(first.data));
    expect(adminService.getGroups).toHaveBeenCalledWith({
      query: undefined,
      limit: 20,
      cursor: undefined,
    });
    expect(result.current.hasPrevPage).toBe(false);
    act(() => result.current.handleNextPage());
    await waitFor(() => expect(result.current.groups).toEqual(second.data));
    expect(result.current.hasPrevPage).toBe(true);
    act(() => result.current.handleNextPage());
    await waitFor(() => expect(result.current.groups).toEqual(last.data));
    act(() => result.current.handleNextPage());
    expect(result.current.groups).toEqual(last.data);
    act(() => result.current.handlePrevPage());
    await waitFor(() => expect(result.current.groups).toEqual(second.data));
    act(() => result.current.handlePrevPage());
    await waitFor(() => expect(result.current.groups).toEqual(first.data));
    expect(result.current.hasPrevPage).toBe(false);
    act(() => result.current.handlePrevPage());
    expect(result.current.hasPrevPage).toBe(false);
  });
  it("debounces searches and resets pagination after the new search becomes active", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.groups).toEqual(first.data));
    act(() => result.current.handleNextPage());
    await waitFor(() => expect(result.current.groups).toEqual(second.data));
    act(() => result.current.handleSearch("Eng"));
    act(() => result.current.handleSearch("Engineering"));
    expect(result.current.search).toBe("Engineering");
    expect(adminService.getGroups).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: "Eng" })
    );
    await waitFor(() =>
      expect(adminService.getGroups).toHaveBeenCalledWith({
        query: "Engineering",
        limit: 20,
        cursor: undefined,
      })
    );
    await waitFor(() => expect(result.current.hasPrevPage).toBe(false));
    expect(result.current.groups).toEqual(first.data);
  });
  it("exposes recoverable loading errors and refetches without clearing the search", async () => {
    vi.mocked(adminService.getGroups).mockRejectedValueOnce(new Error("offline"));
    const { result } = setup();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.groups).toEqual([]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("offline");
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.groups).toEqual(first.data));
    expect(result.current.isError).toBe(false);
  });
  it("does not follow a next-page flag without a cursor", async () => {
    vi.mocked(adminService.getGroups).mockResolvedValue({
      data: [],
      meta: { has_next: true },
    } as never);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.handleNextPage());
    expect(result.current.hasPrevPage).toBe(false);
    expect(adminService.getGroups).toHaveBeenCalledOnce();
  });
});
