import { LoadingScreen } from "@/components/ui/loading-screen";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

it("removes the splash immediately when initialization finishes", () => {
  const { rerender } = render(<LoadingScreen isLoading message="Initializing AtoiTalk" />);
  expect(screen.getByText("Initializing AtoiTalk")).toBeInTheDocument();
  rerender(<LoadingScreen isLoading={false} message="Initializing AtoiTalk" />);
  expect(screen.queryByText("Initializing AtoiTalk")).not.toBeInTheDocument();
});
