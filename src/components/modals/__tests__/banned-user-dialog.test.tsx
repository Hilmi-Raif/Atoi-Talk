import { authService } from "@/services";
import { useAuthStore, useChatStore, useUIStore } from "@/store";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { BannedUserDialog } from "../banned-user-dialog";

vi.mock("@/services", () => ({ authService: { logout: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
describe("live account ban notification", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useAuthStore.getState().setCredentials("session", { id: "u1" } as never);
    vi.mocked(authService.logout).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
    useChatStore.getState().reset();
    useUIStore.getState().reset();
  });
  function setup() {
    return render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<BannedUserDialog />} />
          <Route path="/login" element={<h1>Login destination</h1>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  function ban(reason?: string) {
    act(() => {
      window.dispatchEvent(new CustomEvent("user-banned", { detail: { reason } }));
    });
  }

  it.each([undefined, "Repeated spam"])(
    "opens only on a ban event and shows the supplied reason: %s",
    (reason) => {
      setup();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      ban(reason);
      expect(screen.getByRole("dialog", { name: "Account Banned" })).toBeVisible();
      if (reason) expect(screen.getByText(reason)).toBeVisible();
      else expect(screen.queryByText("Reason:")).not.toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByRole("dialog")).toBeVisible();
    }
  );
  it("closes on an unban event and clears an old reason before a subsequent ban", async () => {
    setup();
    ban("Old reason");
    act(() => {
      window.dispatchEvent(new CustomEvent("user-unbanned"));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    ban();
    expect(screen.queryByText("Old reason")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
  it.each([false, true])(
    "logs out locally and returns to login even if the remote logout fails=%s",
    async (fails) => {
      if (fails) vi.mocked(authService.logout).mockRejectedValue(new Error("Offline"));
      setup();
      context.client.setQueryData(["private-data"], { secret: true });
      ban();
      fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
      expect(await screen.findByRole("heading", { name: "Login destination" })).toBeVisible();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(context.client.getQueryData(["private-data"])).toBeUndefined();
    }
  );
  it("removes event listeners when unmounted", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = setup();
    unmount();
    expect(remove).toHaveBeenCalledWith("user-banned", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("user-unbanned", expect.any(Function));
    remove.mockRestore();
  });
});
