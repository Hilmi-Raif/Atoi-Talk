import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportActionDialogs } from "../reports/report-action-dialogs";

describe("report action confirmation", () => {
  afterEach(cleanup);
  function setup(overrides: Partial<React.ComponentProps<typeof ReportActionDialogs>> = {}) {
    const props = {
      resolveOpen: false,
      rejectOpen: false,
      deleteOpen: false,
      onResolveOpenChange: vi.fn(),
      onRejectOpenChange: vi.fn(),
      onDeleteOpenChange: vi.fn(),
      resolveNotes: "",
      onResolveNotesChange: vi.fn(),
      selectedReport: null,
      onResolve: vi.fn(),
      onReject: vi.fn(),
      onDelete: vi.fn(),
      isPending: false,
      isDeletePending: false,
      ...overrides,
    };
    render(<ReportActionDialogs {...props} />);
    return props;
  }
  it.each(["resolve", "reject"] as const)(
    "edits %s notes and only invokes the selected action",
    (kind) => {
      const props = setup({
        resolveOpen: kind === "resolve",
        rejectOpen: kind === "reject",
        resolveNotes: "Reviewed",
      });
      const dialog = screen.getByRole("dialog", {
        name: kind === "resolve" ? "Resolve Report" : "Reject Report",
      });
      expect(within(dialog).getByRole("textbox")).toHaveValue("Reviewed");
      fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "New notes" } });
      expect(props.onResolveNotesChange).toHaveBeenCalledWith("New notes");
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: kind === "resolve" ? "Resolve Report" : "Reject Report",
        })
      );
      expect(kind === "resolve" ? props.onResolve : props.onReject).toHaveBeenCalledOnce();
      expect(kind === "resolve" ? props.onReject : props.onResolve).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(
        kind === "resolve" ? props.onResolveOpenChange : props.onRejectOpenChange
      ).toHaveBeenCalledWith(false);
    }
  );
  it.each(["message", "user", "group", null])(
    "only warns about irreversible content removal for message reports (%s)",
    (target_type) => {
      setup({ resolveOpen: true, selectedReport: target_type ? ({ target_type } as never) : null });
      if (target_type === "message")
        expect(screen.getByText("permanently delete the reported message content")).toBeVisible();
      else
        expect(
          screen.queryByText("permanently delete the reported message content")
        ).not.toBeInTheDocument();
    }
  );
  it.each(["resolve", "reject"] as const)(
    "prevents %s cancellation, duplicate submission and Escape while pending",
    (kind) => {
      const props = setup({
        resolveOpen: kind === "resolve",
        rejectOpen: kind === "reject",
        isPending: true,
      });
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: kind === "resolve" ? /Resolve Report/ : /Reject Report/,
        })
      );
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(props.onResolve).not.toHaveBeenCalled();
      expect(props.onReject).not.toHaveBeenCalled();
      expect(props.onResolveOpenChange).not.toHaveBeenCalled();
      expect(props.onRejectOpenChange).not.toHaveBeenCalled();
      expect(dialog).toBeVisible();
    }
  );
  it("requires a separate destructive confirmation before deleting a report", () => {
    const props = setup({ deleteOpen: true });
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });
  it.each(["resolve", "reject"] as const)(
    "allows closing an idle %s dialog with Escape",
    (kind) => {
      const props = setup({ resolveOpen: kind === "resolve", rejectOpen: kind === "reject" });
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(
        kind === "resolve" ? props.onResolveOpenChange : props.onRejectOpenChange
      ).toHaveBeenCalledWith(false);
      expect(props.onResolve).not.toHaveBeenCalled();
      expect(props.onReject).not.toHaveBeenCalled();
    }
  );
  it("locks destructive confirmation while the deletion is pending", () => {
    const props = setup({ deleteOpen: true, isDeletePending: true });
    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onDeleteOpenChange).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
