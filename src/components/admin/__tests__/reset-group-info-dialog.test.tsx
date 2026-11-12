import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResetGroupInfoDialog } from "../groups/reset-group-info-dialog";

describe("group information reset confirmation", () => {
  it.each(["Reset Avatar", "Reset Name", "Reset Description"])(
    "submits only the selected %s field",
    (label) => {
      const onConfirm = vi.fn();
      render(
        <ResetGroupInfoDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} isPending={false} />
      );
      const submit = screen.getByRole("button", { name: "Reset Info" });
      expect(submit).toBeDisabled();
      fireEvent.click(screen.getByRole("checkbox", { name: label }));
      fireEvent.click(submit);
      expect(onConfirm).toHaveBeenCalledWith({
        reset_avatar: label === "Reset Avatar",
        reset_name: label === "Reset Name",
        reset_description: label === "Reset Description",
      });
    }
  );

  it("does not dismiss or resubmit while a reset is pending", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const view = render(
      <ResetGroupInfoDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        isPending={false}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Reset Avatar" }));
    view.rerender(
      <ResetGroupInfoDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} isPending />
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Reset Info/ }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    for (const checkbox of within(dialog).getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
  });

  it("allows escape and cancellation when no request is pending", () => {
    const onOpenChange = vi.fn();
    render(
      <ResetGroupInfoDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isPending={false}
      />
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
