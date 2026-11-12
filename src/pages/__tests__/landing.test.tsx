import { ThemeProvider } from "@/components/providers/theme-provider";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import Landing from "../landing";

afterEach(() => {
  cleanup();
  localStorage.removeItem("vite-ui-theme");
});
describe("landing page", () => {
  function show(theme: "light" | "dark" = "light") {
    return render(
      <ThemeProvider defaultTheme={theme}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<h1>Login destination</h1>} />
            <Route path="/register" element={<h1>Registration destination</h1>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    );
  }
  it.each(["load", "error"])("removes both image placeholders after image %s events", (event) => {
    const { container } = show();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(7);
    const desktop = screen.getByAltText("AtoiTalk desktop view");
    const mobile = screen.getByAltText("AtoiTalk mobile view");
    fireEvent[event as "load" | "error"](desktop);
    expect(desktop).toHaveClass("opacity-100");
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
    fireEvent[event as "load" | "error"](mobile);
    expect(mobile).toHaveClass("opacity-100");
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
  });
  it.each([
    ["Create account", "Registration destination"],
    ["Sign in", "Login destination"],
  ])("navigates with the %s link", (label, heading) => {
    show("dark");
    fireEvent.click(screen.getByRole("link", { name: label }));
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  });
  it("opens the source repository safely in another tab", () => {
    const { container } = show();
    const source = container.querySelector('a[href^="https://github.com/"]');
    expect(source).toHaveAttribute("target", "_blank");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
  });
});
