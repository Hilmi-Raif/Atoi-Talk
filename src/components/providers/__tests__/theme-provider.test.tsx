import { ThemeProvider } from "@/components/providers/theme-provider";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
    window.matchMedia = () =>
      ({
        matches: true,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light", "dark");
  });

  test("defaults to light theme when no stored preference exists", async () => {
    render(
      <ThemeProvider>
        <div />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});
