import { ChatInputArea } from "@/components/chat/footer/chat-input-area";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockIsMobile = false;

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock("@/components/ui/emoji-picker", () => ({
  EmojiPicker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmojiPickerContent: () => <div />,
  EmojiPickerFooter: () => <div />,
  EmojiPickerSearch: () => <input aria-label="emoji-search" />,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const createProps = () => ({
  isGlobalUploading: false,
  isSending: false,
  isEditing: false,
  isLoading: false,
  attachmentMode: false,
  canSubmitMessage: true,
  onAttachmentModeChange: vi.fn(),
  isEmojiOpen: false,
  onEmojiOpenChange: vi.fn(),
  onEmojiSelect: vi.fn(),
  textareaRef: React.createRef<HTMLTextAreaElement>(),
  newMessageText: "Hello",
  onNewMessageTextChange: vi.fn(),
  onSendMessage: vi.fn(),
  onTyping: vi.fn(),
});

const renderComponent = (override: Partial<ReturnType<typeof createProps>> = {}) => {
  const props = { ...createProps(), ...override };
  render(<ChatInputArea {...props} />);
  return props;
};

describe("ChatInputArea", () => {
  afterEach(() => {
    mockIsMobile = false;
    vi.clearAllMocks();
  });

  it("sends message with Enter on desktop", () => {
    const { onSendMessage } = renderComponent();

    fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), { key: "Enter" });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send message with Shift+Enter", () => {
    const { onSendMessage } = renderComponent();

    fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), {
      key: "Enter",
      shiftKey: true,
    });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("does not send message with Enter on mobile", () => {
    mockIsMobile = true;
    const { onSendMessage } = renderComponent();

    fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), { key: "Enter" });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("shows spinner and loading label when sending", () => {
    renderComponent({ isSending: true });

    expect(screen.getByRole("button", { name: "Sending message" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("disables send button when edit draft has no effective content", () => {
    renderComponent({
      attachmentMode: true,
      canSubmitMessage: false,
      newMessageText: "",
    });

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});
