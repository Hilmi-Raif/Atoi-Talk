import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/axios";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { enablePush } from "@/lib/push";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PushNotificationMenuItem } from "../push-notification-menu-item";

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setOpen(true)}>Notifications</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PushNotificationMenuItem open={open} onOpenChange={setOpen} />
    </>
  );
}
vi.mock("@/lib/push", () => ({ enablePush: vi.fn(), disablePush: vi.fn() }));
vi.mock("@/lib/axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const setGlobal = vi.fn();
const setMute = vi.fn();
beforeEach(() => {
  localStorage.clear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(api.get).mockResolvedValue({
    data: {
      data: [{ chat_id: "chat-a", name: "Friends", muted_forever: true }],
      meta: { has_next: false, next_cursor: "" },
    },
  });
  vi.mocked(enablePush).mockReset();
  vi.stubEnv("VITE_PUSH_ENABLED", "true");
  for (const name of ["API_KEY", "PROJECT_ID", "MESSAGING_SENDER_ID", "APP_ID", "VAPID_KEY"])
    vi.stubEnv(`VITE_FIREBASE_${name}`, "configured");
  vi.stubGlobal("Notification", { permission: "granted" });
  setGlobal.mockReset().mockResolvedValue(undefined);
  setMute.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ token: "session-a" });
  useNotificationPreferences.setState({
    loaded: true,
    enabled: true,
    chats: [{ chat_id: "chat-a", name: "Friends", muted_forever: true }],
    refresh: vi.fn().mockResolvedValue(undefined),
    setGlobal,
    setMute,
  });
});
async function openSettings() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsMenu />
    </QueryClientProvider>
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: "Account" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Notifications" }));
  await screen.findByRole("dialog");
  await waitFor(() => expect(screen.queryByRole("menu", { hidden: true })).not.toBeInTheDocument());
}
it("shows named muted conversations and updates the global switch", async () => {
  await openSettings();
  expect(await screen.findByText("Friends")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: "Message notifications" }));
  await waitFor(() => expect(setGlobal).toHaveBeenCalledWith(false));
  fireEvent.click(screen.getByRole("button", { name: "Unmute" }));
  await waitFor(() => expect(setMute).toHaveBeenCalledWith("chat-a", "off"));
});
it("reports saving errors through a toast without inline retry", async () => {
  setGlobal.mockRejectedValueOnce(new Error("Connection unavailable"));
  await openSettings();
  fireEvent.click(screen.getByRole("switch", { name: "Message notifications" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Connection unavailable"));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
});

it("reports activation errors through a toast and allows the normal enable button again", async () => {
  vi.mocked(enablePush)
    .mockImplementationOnce(async (_session, progress) => {
      progress?.("Connecting to browser push service�");
      throw new Error("Push activation timed out");
    })
    .mockResolvedValueOnce(undefined);
  await openSettings();
  fireEvent.click(screen.getByRole("button", { name: "Enable on this device" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Push activation timed out"));
  expect(screen.queryByText(/If no permission prompt appears/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Enable on this device" }));
  await waitFor(() => expect(enablePush).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Browser notifications enabled")).toBeInTheDocument();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("keeps the device button label width while showing the shared loading spinner", async () => {
  let finish!: () => void;
  vi.mocked(enablePush).mockImplementationOnce(async (_token, progress) => {
    progress?.("Waiting for browser permission");
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  await openSettings();
  const button = screen.getByRole("button", { name: "Enable on this device" });
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"));
  expect(button).toBeDisabled();
  expect(button.querySelector(".opacity-0")).toHaveTextContent("Enable on this device");
  expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();
  expect(screen.queryByText("Waiting for browser permission")).not.toBeInTheDocument();
  finish();
  await waitFor(() => expect(button).toHaveAttribute("aria-busy", "false"));
});
