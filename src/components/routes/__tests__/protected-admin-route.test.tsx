import { userService } from "@/services";
import { useAuthStore } from "@/store";
import type { User } from "@/types";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import ProtectedAdminRoute from "../protected-admin-route";

vi.mock("@/services", () => ({ userService: { getCurrentUser: vi.fn() } }));
const user = { id: "u1", full_name: "Ada", role: "user" } as User;
describe("admin route authorization", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    useAuthStore.getState().logout();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
    useAuthStore.getState().logout();
  });
  function show() {
    return render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/login" element={<h1>Login</h1>} />
          <Route path="/" element={<h1>Home</h1>} />
          <Route element={<ProtectedAdminRoute />}>
            <Route path="/admin" element={<h1>Admin controls</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
      { wrapper: context.wrapper }
    );
  }
  it("redirects a guest without requesting current-user data", async () => {
    show();
    expect(await screen.findByRole("heading", { name: "Login" })).toBeVisible();
    expect(userService.getCurrentUser).not.toHaveBeenCalled();
  });
  it("renders no privileged content while the authenticated role is loading", async () => {
    useAuthStore.getState().setCredentials("session", { ...user, role: "admin" });
    let resolve!: (user: User) => void;
    vi.mocked(userService.getCurrentUser).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    show();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    await act(async () => {
      resolve(user);
    });
    expect(await screen.findByRole("heading", { name: "Home" })).toBeVisible();
  });
  it.each(["admin", "user"] as const)(
    "uses the fetched %s role rather than a stale session role",
    async (role) => {
      useAuthStore
        .getState()
        .setCredentials("session", { ...user, role: role === "admin" ? "user" : "admin" });
      vi.mocked(userService.getCurrentUser).mockResolvedValue({ ...user, role });
      show();
      expect(
        await screen.findByRole("heading", { name: role === "admin" ? "Admin controls" : "Home" })
      ).toBeVisible();
    }
  );
  it.each(["admin", "user"] as const)(
    "falls back to the session %s role if current-user lookup fails",
    async (role) => {
      useAuthStore.getState().setCredentials("session", { ...user, role });
      vi.mocked(userService.getCurrentUser).mockRejectedValue(new Error("offline"));
      show();
      expect(
        await screen.findByRole("heading", { name: role === "admin" ? "Admin controls" : "Home" })
      ).toBeVisible();
    }
  );
});
