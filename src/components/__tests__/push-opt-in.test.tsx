import { toast } from "@/lib/toast";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatOnboarding } from "../chat/chat-onboarding";
import { OnboardingProvider } from "../providers/onboarding-provider";
import { PushOptIn } from "../push-opt-in";
const tour = vi.hoisted(() => ({
  drive: vi.fn(),
  destroy: vi.fn(),
  config: {} as { onDestroyed?: () => void },
}));
vi.mock("driver.js", () => ({
  driver: (config: typeof tour.config) => {
    tour.config = config;
    return tour;
  },
}));
const mocks = vi.hoisted(() => ({
  token: "session" as string | null,
  enable: vi.fn(),
  supported: vi.fn(),
}));
vi.mock("@/store", () => ({
  useAuthStore: (select: (s: { token: string | null }) => unknown) =>
    select({ token: mocks.token, user: { id: "user1" } } as { token: string | null }),
}));
vi.mock("@/lib/push", () => ({ enablePush: mocks.enable }));
vi.mock("firebase/messaging", () => ({ isSupported: mocks.supported }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/push-config", () => ({ pushConfigured: () => true }));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.token = "session";
  mocks.supported.mockResolvedValue(true);
  vi.stubGlobal("isSecureContext", true);
  mocks.enable.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { permission: "default" });
});
it.each([new Error("Permission unavailable"), "failed"])(
  "reports an unsuccessful opt in and remembers the invitation",
  async (error) => {
    mocks.enable.mockRejectedValue(error);
    render(<PushOptIn />);
    fireEvent.click(await screen.findByRole("button", { name: "Enable" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        error instanceof Error ? error.message : "Could not enable notifications."
      )
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(localStorage.getItem("atoitalk-push-invitation-dismissed")).toBe("true");
  }
);
it("prevents dismissal and duplicate permission requests while opt in is pending", async () => {
  let resolve!: () => void;
  mocks.enable.mockReturnValue(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  render(<PushOptIn />);
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Enable" }));
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: /^Enable/ }));
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Later" })).toBeDisabled();
  expect(mocks.enable).toHaveBeenCalledOnce();
  resolve();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("does not show a late support result after unmount", async () => {
  let resolve!: (value: boolean) => void;
  mocks.supported.mockReturnValue(
    new Promise<boolean>((done) => {
      resolve = done;
    })
  );
  const view = render(<PushOptIn />);
  view.unmount();
  resolve(true);
  await Promise.resolve();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.enable).not.toHaveBeenCalled();
});
it("handles a failed browser support check without requesting permission", async () => {
  mocks.supported.mockRejectedValue(new Error("Browser unavailable"));
  render(<PushOptIn />);
  await waitFor(() => expect(mocks.supported).toHaveBeenCalled());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.enable).not.toHaveBeenCalled();
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
it("does not persist an accidental close as Later", async () => {
  render(<PushOptIn />);
  fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(localStorage.getItem("atoitalk-push-invitation-dismissed")).toBeNull();
});
it("ignores outside pointer clicks but still allows closing with Escape", async () => {
  render(<PushOptIn />);
  const dialog = await screen.findByRole("dialog");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  fireEvent.pointerDown(document.body, { pointerType: "mouse", button: 0 });
  fireEvent.click(document.body);
  expect(dialog).toBeInTheDocument();
  expect(sessionStorage.getItem("atoitalk-push-invitation-dismissed")).toBeNull();
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});
it("waits for onboarding to close before offering notifications", async () => {
  const target = document.createElement("button");
  target.dataset.tour = "groups";
  document.body.append(target);
  render(
    <OnboardingProvider>
      <ChatOnboarding userId="user1" />
      <PushOptIn />
    </OnboardingProvider>
  );
  await waitFor(() => expect(tour.drive).toHaveBeenCalled());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => {
    tour.config.onDestroyed?.();
  });
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  target.remove();
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
