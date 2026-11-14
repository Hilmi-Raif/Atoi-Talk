import { act, render } from "@testing-library/react";
import type { Config } from "driver.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatOnboarding, OnboardingLoadingContext } from "../chat-onboarding";

const tour = vi.hoisted(() => ({ drive: vi.fn(), destroy: vi.fn(), config: {} as Config }));
vi.mock("driver.js", () => ({
  driver: (config: Config) => {
    tour.config = config;
    return tour;
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

it("automatically highlights groups and does not repeat for the same account", () => {
  for (const name of ["new-chat", "groups", "chat-search", "account"]) {
    const button = document.createElement("button");
    button.dataset.tour = name;
    document.body.append(button);
  }
  const first = render(<ChatOnboarding userId="user1" />);
  act(() => vi.advanceTimersByTime(300));
  expect(tour.drive).toHaveBeenCalledOnce();
  expect(tour.config.stagePadding).toBe(4);
  expect(tour.config.stageRadius).toBe(6);
  expect(tour.config.overlayClickBehavior).toBe("none");
  expect(tour.config.allowClose).toBe(true);
  expect(tour.config.steps?.map((step) => (step.element as HTMLElement).dataset.tour)).toEqual([
    "new-chat",
    "groups",
    "chat-search",
    "account",
  ]);
  expect(first.container).toBeEmptyDOMElement();
  first.unmount();
  render(<ChatOnboarding userId="user1" />);
  act(() => vi.advanceTimersByTime(300));
  expect(tour.drive).toHaveBeenCalledOnce();
});

it("allows a different account its first tour", () => {
  localStorage.setItem("atoitalk:onboarding:user1", "seen");
  const button = document.createElement("button");
  button.dataset.tour = "groups";
  document.body.append(button);
  render(<ChatOnboarding userId="user2" />);
  act(() => vi.advanceTimersByTime(300));
  expect(tour.drive).toHaveBeenCalledOnce();
});

it("does not consume the first tour before controls are available", () => {
  render(<ChatOnboarding userId="user1" />);
  act(() => vi.advanceTimersByTime(300));
  expect(tour.drive).not.toHaveBeenCalled();
  expect(localStorage.getItem("atoitalk:onboarding:user1")).toBeNull();
});

it("cancels a pending tour on unmount", () => {
  const { unmount } = render(<ChatOnboarding userId="user1" />);
  unmount();
  act(() => vi.advanceTimersByTime(300));
  expect(tour.drive).not.toHaveBeenCalled();
});
it("waits until the application loading screen has ended", () => {
  const button = document.createElement("button");
  button.dataset.tour = "groups";
  document.body.append(button);
  const { rerender } = render(
    <OnboardingLoadingContext.Provider value={true}>
      <ChatOnboarding userId="user1" />
    </OnboardingLoadingContext.Provider>
  );
  act(() => vi.advanceTimersByTime(3000));
  expect(tour.drive).not.toHaveBeenCalled();
  expect(localStorage.getItem("atoitalk:onboarding:user1")).toBeNull();
  rerender(
    <OnboardingLoadingContext.Provider value={false}>
      <ChatOnboarding userId="user1" />
    </OnboardingLoadingContext.Provider>
  );
  act(() => vi.advanceTimersByTime(300));
  expect(tour.drive).toHaveBeenCalledOnce();
});
