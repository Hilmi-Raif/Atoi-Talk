import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PushOptIn } from "../push-opt-in";
const mocks = vi.hoisted(() => ({
  token: "session" as string | null,
  enable: vi.fn(),
  supported: vi.fn(),
}));
vi.mock("@/store", () => ({
  useAuthStore: (select: (s: { token: string | null }) => unknown) =>
    select({ token: mocks.token }),
}));
vi.mock("@/lib/push", () => ({ enablePush: mocks.enable }));
vi.mock("firebase/messaging", () => ({ isSupported: mocks.supported }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/push-config", () => ({ pushConfigured: () => true }));
beforeEach(() => {
  localStorage.clear();
  mocks.token = "session";
  mocks.supported.mockResolvedValue(true);
  vi.stubGlobal("isSecureContext", true);
  mocks.enable.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { permission: "default" });
});
it("only requests permission after an explicit click", async () => {
  render(<PushOptIn />);
  expect(mocks.enable).not.toHaveBeenCalled();
  expect(await screen.findByRole("dialog", { name: "Enable notifications?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Enable" }));
  await waitFor(() => expect(mocks.enable).toHaveBeenCalledWith("session"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("remembers Later across refreshes", async () => {
  const view = render(<PushOptIn />);
  fireEvent.click(await screen.findByRole("button", { name: "Later" }));
  view.unmount();
  render(<PushOptIn />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it.each(["denied", "granted"])("does not prompt when permission is %s", (permission) => {
  vi.stubGlobal("Notification", { permission });
  render(<PushOptIn />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("does not invite before login or when the device was explicitly disabled", () => {
  mocks.token = null;
  const view = render(<PushOptIn />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  mocks.token = "session";
  localStorage.setItem("atoitalk-push-invitation-dismissed", "true");
  view.unmount();
  render(<PushOptIn />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

afterEach(() => vi.unstubAllGlobals());
it("does not invite when browser push is unsupported", async () => {
  mocks.supported.mockResolvedValue(false);
  render(<PushOptIn />);
  await waitFor(() => expect(mocks.supported).toHaveBeenCalled());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("remembers closing the initial setup dialog", async () => {
  const view = render(<PushOptIn />);
  fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  view.unmount();
  render(<PushOptIn />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
