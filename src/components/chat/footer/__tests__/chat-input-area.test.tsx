import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInputArea } from "../chat-input-area";

const platform = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => platform.mobile }));

describe("chat composer keyboard behavior", () => {
  beforeEach(() => {
    platform.mobile = false;
  });
  afterEach(cleanup);
  function setup(overrides: Partial<React.ComponentProps<typeof ChatInputArea>> = {}) {
    const props = {
      isGlobalUploading: false,
      isSending: false,
      isEditing: false,
      attachmentMode: false,
      canSubmitMessage: true,
      onAttachmentModeChange: vi.fn(),
      isEmojiOpen: false,
      onEmojiOpenChange: vi.fn(),
      onEmojiSelect: vi.fn(),
      textareaRef: { current: null },
      newMessageText: "Draft",
      onNewMessageTextChange: vi.fn(),
      onSendMessage: vi.fn(),
      onTyping: vi.fn(),
      ...overrides,
    };
    const view = render(<ChatInputArea {...props} />);
    return { ...view, props };
  }
  it.each([false, true])(
    "keeps mobile Enter as a newline and desktop Enter as send (mobile=%s)",
    (mobile) => {
      platform.mobile = mobile;
      const { props } = setup();
      const textarea = screen.getByRole("textbox");
      expect(textarea).toHaveAttribute("enterkeyhint", mobile ? "enter" : "send");
      fireEvent.keyDown(textarea, { key: "Enter" });
      expect(props.onSendMessage).toHaveBeenCalledTimes(mobile ? 0 : 1);
      fireEvent.change(textarea, { target: { value: "Changed draft" } });
      expect(props.onNewMessageTextChange).toHaveBeenCalledWith("Changed draft");
      expect(props.onTyping).toHaveBeenCalledOnce();
    }
  );
  it.each(["isGlobalUploading", "isSending", "isEditing", "isLoading"] as const)(
    "locks composer controls during %s",
    (flag) => {
      const { container, props } = setup({ [flag]: true });
      expect(screen.getByRole("textbox")).toBeDisabled();
      for (const button of container.querySelectorAll("button")) {
        expect(button).toBeDisabled();
        fireEvent.click(button);
      }
      expect(props.onSendMessage).not.toHaveBeenCalled();
      expect(props.onAttachmentModeChange).not.toHaveBeenCalled();
      expect(props.onEmojiOpenChange).not.toHaveBeenCalled();
    }
  );
  it("opens the emoji popover without submitting the draft", () => {
    const { container, props } = setup();
    fireEvent.click(container.querySelector("button:has(svg.lucide-smile)")!);
    expect(props.onEmojiOpenChange).toHaveBeenCalledWith(true);
    expect(props.onSendMessage).not.toHaveBeenCalled();
  });
});
