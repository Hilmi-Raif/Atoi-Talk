import { toast } from "@/lib/toast";
import { reportService } from "@/services";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { ReportDialog } from "../report-dialog";

vi.mock("@/services", () => ({ reportService: { createReport: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
describe("report submission", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    vi.clearAllMocks();
    context = createQueryWrapper();
    vi.mocked(reportService.createReport).mockResolvedValue(undefined as never);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup(targetType: "user" | "group" | "message" = "user", targetName?: string) {
    const onClose = vi.fn();
    const view = render(
      <ReportDialog
        isOpen
        onClose={onClose}
        targetType={targetType}
        targetId="target1"
        targetName={targetName}
      />,
      { wrapper: context.wrapper }
    );
    return { ...view, onClose };
  }
  it.each([
    ["user", "target_user_id"],
    ["group", "chat_id"],
    ["message", "message_id"],
  ] as const)("submits %s evidence using only its correct target key", async (type, key) => {
    const { onClose } = setup(type, "Engineering");
    expect(screen.getByText('Why are you reporting "Engineering"?')).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.change(screen.getByLabelText("Description (Optional)"), {
      target: { value: "Repeated unwanted messages" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
    expect(reportService.createReport).toHaveBeenCalledWith({
      target_type: type,
      [key]: "target1",
      reason: "Spam",
      description: "Repeated unwanted messages",
    });
    expect(toast.success).toHaveBeenCalledWith("Report submitted successfully");
  });
  it("requires a selected reason and a nonempty custom reason", async () => {
    setup();
    expect(screen.getByText("Please select a reason for reporting.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    expect(await screen.findByText("Reason is required")).toBeVisible();
    expect(reportService.createReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    expect(screen.getByRole("button", { name: "Submit Report" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Specify Reason"), {
      target: { value: "Impersonates a colleague" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() =>
      expect(reportService.createReport).toHaveBeenCalledWith({
        target_type: "user",
        target_user_id: "target1",
        reason: "Impersonates a colleague",
        description: "",
      })
    );
  });
  it.each([
    [{ response: { data: { error: "Already reported" } } }, "Already reported"],
    [new Error("offline"), "Failed to submit report"],
  ])("preserves entered evidence on failure", async (error, message) => {
    vi.mocked(reportService.createReport).mockRejectedValue(error);
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Harassment" }));
    fireEvent.change(screen.getByLabelText("Description (Optional)"), {
      target: { value: "Keep this evidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Description (Optional)")).toHaveValue("Keep this evidence");
    expect(screen.getByRole("button", { name: "Submit Report" })).toBeEnabled();
  });
  it("locks dismissal, duplicate submission and evidence editing while saving", async () => {
    let finish!: () => void;
    vi.mocked(reportService.createReport).mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve(undefined as never);
      })
    );
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Spam" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() => expect(reportService.createReport).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Description (Optional)")).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Submit Report/ })).toBeDisabled();
    await act(async () => finish());
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
  });
});
