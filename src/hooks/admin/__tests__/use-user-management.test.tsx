import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { useUserManagement } from "../use-user-management";

describe("admin user action coordination", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    context = createQueryWrapper();
  });
  afterEach(() => context.client.clear());
  it.each([
    ["view", "userActionOpen"],
    ["ban", "userBanOpen"],
    ["reset", "userResetOpen"],
    ["unban", "userUnbanOpen"],
  ] as const)("opens only the requested %s dialog for the selected user", (action, field) => {
    const { result } = renderHook(() => useUserManagement(null), { wrapper: context.wrapper });
    act(() => result.current.actions.handleUserAction("u2", action));
    expect(result.current.state.actionUserId).toBe("u2");
    expect(result.current.state.userReviewId).toBe(action === "view" ? "u2" : null);
    for (const name of [
      "userActionOpen",
      "userBanOpen",
      "userResetOpen",
      "userUnbanOpen",
    ] as const) {
      expect(result.current.state[name]).toBe(name === field);
    }
    act(() => {
      result.current.state.setUserActionOpen(false);
      result.current.state.setUserBanOpen(false);
      result.current.state.setUserResetOpen(false);
      result.current.state.setUserUnbanOpen(false);
      result.current.state.setActionUserId(null);
    });
    expect(result.current.state[field]).toBe(false);
    expect(result.current.state.actionUserId).toBeNull();
  });
  it.each(["handleBanSuccess", "handleUnbanSuccess"] as const)(
    "%s refreshes related views without invalidating another user's detail",
    (action) => {
      const keys = [
        ["admin-reports"],
        ["admin-report-detail", "r1"],
        ["admin-report-detail", "r2"],
        ["admin-user-detail", "u2"],
        ["admin-user-detail", "u3"],
        ["admin-group-members-infinite", "g1"],
        ["unrelated"],
      ];
      keys.forEach((key) => context.client.setQueryData(key, { cached: true }));
      const { result } = renderHook(() => useUserManagement("r1"), { wrapper: context.wrapper });
      act(() => result.current.actions[action]("u2"));
      keys.forEach((key, index) =>
        expect(context.client.getQueryState(key)?.isInvalidated).toBe([0, 1, 3, 5].includes(index))
      );
    }
  );
  it("refreshes user and membership views without selecting a report", () => {
    context.client.setQueryData(["admin-report-detail", "r1"], {});
    context.client.setQueryData(["admin-user-detail", "u2"], {});
    const { result } = renderHook(() => useUserManagement(null), { wrapper: context.wrapper });
    act(() => result.current.actions.handleBanSuccess("u2"));
    act(() => result.current.actions.handleUnbanSuccess("u2"));
    expect(context.client.getQueryState(["admin-report-detail", "r1"])?.isInvalidated).toBe(false);
    expect(context.client.getQueryState(["admin-user-detail", "u2"])?.isInvalidated).toBe(true);
  });
});
