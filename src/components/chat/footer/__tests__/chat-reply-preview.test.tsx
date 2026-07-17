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
