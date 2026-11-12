import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { ExitContent } from "../ui/exit-content";

it("keeps the last visible content during exit and refreshes immediately on reopen", () => {
  const { rerender } = render(
    <ExitContent open>
      <p>Remove Alice?</p>
    </ExitContent>
  );
  rerender(
    <ExitContent open={false}>
      <p>Remove undefined?</p>
    </ExitContent>
  );
  expect(screen.getByText("Remove Alice?")).toBeInTheDocument();
  rerender(
    <ExitContent open={false}>
      <p>Reset form</p>
    </ExitContent>
  );
  expect(screen.getByText("Remove Alice?")).toBeInTheDocument();
  rerender(
    <ExitContent open>
      <p>Remove Bob?</p>
    </ExitContent>
  );
  expect(screen.getByText("Remove Bob?")).toBeInTheDocument();
  expect(screen.queryByText("Remove Alice?")).not.toBeInTheDocument();
});

it("preserves dialog text when its parent clears the target at close", () => {
  const view = (open: boolean, name: string) => (
    <Dialog open={open}>
      <DialogContent forceMount aria-describedby={undefined}>
        <DialogTitle>Remove {name}?</DialogTitle>
      </DialogContent>
    </Dialog>
  );
  const { rerender } = render(view(true, "Alice"));
  rerender(view(false, "undefined"));
  expect(screen.getByText("Remove Alice?")).toBeInTheDocument();
  expect(screen.queryByText("Remove undefined?")).not.toBeInTheDocument();
  rerender(view(true, "Bob"));
  expect(screen.getByText("Remove Bob?")).toBeInTheDocument();
});
