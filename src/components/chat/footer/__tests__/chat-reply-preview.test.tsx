import { ChatReplyPreview } from "@/components/chat/footer/chat-reply-preview";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const editMessage = {
  id: "message-1",
  chat_id: "chat-1",
  sender_id: "user-1",
  sender_name: "User One",
  content: "Original message",
  type: "text",
  created_at: "2026-01-01T00:00:00Z",
  attachments: [],
  reply_to: null,
};

const createProps = () => ({
  replyTo: null,
  editMessage,
  current: null,
  finalReplySenderName: "User One",
  isGlobalUploading: false,
  isSending: false,
  isEditing: false,
  isLoading: false,
  onCancelReply: vi.fn(),
  onCancelEdit: vi.fn(),
  textareaRef: React.createRef<HTMLTextAreaElement>(),
});

const renderComponent = (override: Partial<ReturnType<typeof createProps>> = {}) => {
  const props = { ...createProps(), ...override };
  render(<ChatReplyPreview {...props} />);
  return props;
};

describe("ChatReplyPreview", () => {
  it.each([true, false])(
    "labels a reply using the current user's identity (own=%s) and cancels only the reply",
    (own) => {
      const props = {
        ...createProps(),
        editMessage: null,
        replyTo: { ...editMessage, content: "First\nSecond\nHidden" },
        current: { id: own ? "user-1" : "other" },
      };
      render(<ChatReplyPreview {...(props as React.ComponentProps<typeof ChatReplyPreview>)} />);
      expect(screen.getByText(own ? "You" : "User One")).toBeInTheDocument();
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { hidden: true }));
      expect(props.onCancelReply).toHaveBeenCalledOnce();
      expect(props.onCancelEdit).not.toHaveBeenCalled();
    }
  );
  it("shows an attachment fallback when a reply has no text", () => {
    renderComponent({ editMessage: { ...editMessage, content: "" } });
    expect(screen.getByText("File")).toBeInTheDocument();
  });
  it("clears and focuses a mounted composer when cancelling an edit", () => {
    const props = createProps();
    render(
      <>
        <textarea ref={props.textareaRef} defaultValue="Draft" />
        <ChatReplyPreview {...props} />
      </>
    );
    fireEvent.click(screen.getByRole("button", { hidden: true }));
    expect(props.textareaRef.current).toHaveValue("");
    expect(props.textareaRef.current).toHaveFocus();
    expect(props.onCancelEdit).toHaveBeenCalledOnce();
  });
  it("allows cancelling edit mode when no submit is pending", () => {
    const { onCancelEdit } = renderComponent();

    const closeButton = screen.getByRole("button");
    expect(closeButton).not.toBeDisabled();

    fireEvent.click(closeButton);

    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it("keeps edit cancel disabled while edit submit is pending", () => {
    renderComponent({ isEditing: true });

    expect(screen.getByRole("button")).toBeDisabled();
  });
});
