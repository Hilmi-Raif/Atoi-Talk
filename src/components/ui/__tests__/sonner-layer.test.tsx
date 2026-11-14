import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";
import { Toaster } from "../sonner";

vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));

afterEach(() => {
  toast.dismiss();
  document.body.classList.remove("driver-active");
});

it("keeps toast notifications in a protected body-level layer during onboarding", async () => {
  document.body.classList.add("driver-active");
  render(<Toaster />);
  toast("Layer check");
  await waitFor(() => expect(screen.getByText("Layer check")).toBeInTheDocument());
  const layer = screen.getByText("Layer check").closest("[data-toast-layer]");
  expect(layer?.parentElement).toBe(document.body);
  expect(layer).toHaveClass("driver-page-interactive", "z-[2147483647]");
});
