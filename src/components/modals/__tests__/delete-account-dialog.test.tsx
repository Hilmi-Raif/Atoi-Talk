import { toast } from "@/lib/toast";
import { authService } from "@/services";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { DeleteAccountDialog } from "../delete-account-dialog";

vi.mock("@/services", () => ({ authService: { deleteAccount: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
describe("account deletion confirmation", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  const close = vi.fn();
  const success = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    context = createQueryWrapper();
    vi.mocked(authService.deleteAccount).mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup(hasPassword = false) {
    return render(
      <DeleteAccountDialog isOpen onClose={close} onSuccess={success} hasPassword={hasPassword} />,
      { wrapper: context.wrapper }
    );
  }
  it("requires an exact DELETE confirmation for an OAuth account and omits a password", async () => {
    setup();
    const button = screen.getByRole("button", { name: "Delete Account", exact: true });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "delete" } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "DELETE" } });
    fireEvent.click(button);
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(authService.deleteAccount).toHaveBeenCalledWith({ password: undefined });
  });
  it.each([
    [
      { response: { status: 403, data: { error: "Internal ownership detail" } } },
      "You cannot delete your account because you are the owner of one or more groups. Please transfer ownership or delete the groups first.",
    ],
    [
      { response: { status: 400, data: { error: "Password is incorrect" } } },
      "Password is incorrect",
    ],
    [new Error("Offline"), "Failed to delete account."],
  ])("retains confirmation after a rejected deletion: %s", async (error, message) => {
    vi.mocked(authService.deleteAccount).mockRejectedValue(error);
    setup(true);
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "StrongPassword1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Account", exact: true }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(screen.getByLabelText("Confirm Password")).toHaveValue("StrongPassword1!");
    expect(success).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it("disables inputs and prevents dismissal while deletion is pending", async () => {
    vi.mocked(authService.deleteAccount).mockImplementation(() => new Promise(() => {}));
    setup(true);
    expect(screen.getByRole("button", { name: "Delete Account", exact: true })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "StrongPassword1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete Account", exact: true }));
    await waitFor(() => expect(screen.getByLabelText("Confirm Password")).toBeDisabled());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).not.toHaveBeenCalled();
  });
  it("clears stale confirmation when reopened and supports cancelling", () => {
    const view = setup();
    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "DELETE" } });
    view.rerender(<DeleteAccountDialog isOpen={false} onClose={close} onSuccess={success} />);
    view.rerender(<DeleteAccountDialog isOpen onClose={close} onSuccess={success} />);
    expect(screen.getByPlaceholderText("DELETE")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledWith(false);
    expect(authService.deleteAccount).not.toHaveBeenCalled();
  });
});
