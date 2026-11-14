import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoadingScreen } from "../loading-screen";

afterEach(() => vi.useRealTimers());

it("reports the visible minimum-duration tail to callers", () => {
  vi.useFakeTimers();
  const onVisibilityChange = vi.fn();
  const { rerender } = render(
    <LoadingScreen isLoading minimumVisibleMs={1000} onVisibilityChange={onVisibilityChange} />
  );
  expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  rerender(
    <LoadingScreen
      isLoading={false}
      minimumVisibleMs={1000}
      onVisibilityChange={onVisibilityChange}
    />
  );
  act(() => vi.advanceTimersByTime(999));
  expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  act(() => vi.advanceTimersByTime(1));
  expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
});

it("holds a visible transition for one second even when its configuration resets on completion", () => {
  vi.useFakeTimers();
  const { rerender } = render(
    <LoadingScreen isLoading message="Loading" delayMs={200} minimumVisibleMs={1000} />
  );
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(20));
  rerender(
    <LoadingScreen
      isLoading={false}
      message="Initializing AtoiTalk"
      delayMs={0}
      minimumVisibleMs={0}
    />
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(979));
  expect(screen.getByRole("status")).toBeVisible();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByRole("status")).toBeNull();
});

it("delays slow transitions and never flashes for fast ones", () => {
  vi.useFakeTimers();
  const { rerender } = render(<LoadingScreen isLoading delayMs={200} />);
  expect(screen.queryByRole("status")).toBeNull();
  act(() => vi.advanceTimersByTime(100));
  rerender(<LoadingScreen isLoading={false} delayMs={200} />);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.queryByRole("status")).toBeNull();
  rerender(<LoadingScreen isLoading delayMs={200} />);
  act(() => vi.advanceTimersByTime(200));
  expect(screen.getByRole("status")).toBeVisible();
  rerender(<LoadingScreen isLoading={false} delayMs={200} />);
  expect(screen.queryByRole("status")).toBeNull();
});
