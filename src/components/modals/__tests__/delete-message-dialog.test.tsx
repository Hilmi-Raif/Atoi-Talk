import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeleteMessageDialog } from "../delete-message-dialog";

type Props = ComponentProps<typeof DeleteMessageDialog>;
function setup(overrides: Partial<Props> = {}, withTextarea = true) {
  const textareaRef = createRef<HTMLTextAreaElement>();
  const props: Props = {
    showDeleteModal: true,
    setShowDeleteModal: vi.fn(),
    messageToDelete: "m1",
    editMessage: null,
    replyTo: null,
    setEditMessage: vi.fn(),
    setAttachmentMode: vi.fn(),
    textareaRef,
    setReplyTo: vi.fn(),
    onConfirmDelete: vi.fn(),
    ...overrides,
  };
  render(
    <>
      {withTextarea && <textarea ref={textareaRef} defaultValue="Draft" aria-label="Draft" />}
      <DeleteMessageDialog {...props} />
    </>
  );
  return props;
}
describe("delete-message confirmation", () => {
  it.each(["edit", "reply", "both"])(
    "clears a matching %s context and requests composer focus before confirmation",
    (kind) => {
      const props = setup({
        editMessage: kind !== "reply" ? ({ id: "m1" } as Props["editMessage"]) : null,
        replyTo: kind !== "edit" ? ({ id: "m1" } as Props["replyTo"]) : null,
      });
      // the open modal traps focus until dismissal
      const focus = vi.spyOn(props.textareaRef.current!, "focus");
      fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
      expect(props.textareaRef.current).toHaveValue("");
      expect(focus).toHaveBeenCalled();
      expect(props.setEditMessage).toHaveBeenCalledTimes(kind === "reply" ? 0 : 1);
      expect(props.setAttachmentMode).toHaveBeenCalledTimes(kind === "reply" ? 0 : 1);
      expect(props.setReplyTo).toHaveBeenCalledTimes(kind === "edit" ? 0 : 1);
      expect(props.onConfirmDelete).toHaveBeenCalledOnce();
    }
  );
  it.each(["edit", "reply"])("can clear %s context when the composer has unmounted", (kind) => {
    const props = setup(
      {
        editMessage: kind === "edit" ? ({ id: "m1" } as Props["editMessage"]) : null,
        replyTo: kind === "reply" ? ({ id: "m1" } as Props["replyTo"]) : null,
      },
      false
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
    expect(kind === "edit" ? props.setEditMessage : props.setReplyTo).toHaveBeenCalledWith(null);
    expect(props.onConfirmDelete).toHaveBeenCalledOnce();
  });
  it.each([null, "another"])(
    "preserves unrelated composer state when the selected message is %s",
    (messageToDelete) => {
      const props = setup({
        messageToDelete,
        editMessage: { id: "m1" } as Props["editMessage"],
        replyTo: { id: "m1" } as Props["replyTo"],
      });
      fireEvent.click(screen.getByRole("button", { name: "Delete", exact: true }));
      expect(props.textareaRef.current).toHaveValue("Draft");
      expect(props.setEditMessage).not.toHaveBeenCalled();
      expect(props.setReplyTo).not.toHaveBeenCalled();
      expect(props.onConfirmDelete).toHaveBeenCalledOnce();
    }
  );
  it("cancels without discarding a draft or sending a delete request", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.setShowDeleteModal).toHaveBeenCalledWith(false);
    expect(props.onConfirmDelete).not.toHaveBeenCalled();
    expect(props.textareaRef.current).toHaveValue("Draft");
  });
});
