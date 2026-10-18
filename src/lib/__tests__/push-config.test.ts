import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationPath, pushConfigured } from "../push-config";

afterEach(() => vi.unstubAllEnvs());
describe("push configuration", () => {
  it("requires explicit opt in and complete Firebase configuration", () => {
    for (const name of ["API_KEY", "PROJECT_ID", "MESSAGING_SENDER_ID", "APP_ID", "VAPID_KEY"])
      vi.stubEnv(`VITE_FIREBASE_${name}`, "");
    vi.stubEnv("VITE_PUSH_ENABLED", "true");
    expect(pushConfigured()).toBe(false);
    for (const name of ["API_KEY", "PROJECT_ID", "MESSAGING_SENDER_ID", "APP_ID", "VAPID_KEY"])
      vi.stubEnv(`VITE_FIREBASE_${name}`, "configured");
    expect(pushConfigured()).toBe(true);
    vi.stubEnv("VITE_PUSH_ENABLED", "false");
    expect(pushConfigured()).toBe(false);
  });
  it("only navigates to a local UUID chat route", () => {
    expect(notificationPath("01234567-89ab-cdef-0123-456789abcdef")).toBe(
      "/chat/01234567-89ab-cdef-0123-456789abcdef"
    );
    expect(notificationPath("https://evil.example")).toBe("/chat");
    expect(notificationPath()).toBe("/chat");
  });
});
