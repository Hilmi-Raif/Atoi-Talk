import { errorLog } from "@/lib/logger";
import { mediaService } from "@/services/media.service";
import { useUIStore } from "@/store";
import { type Media } from "@/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, forwardRef, useImperativeHandle, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import ChatFooter from "../chat-footer";

const sendTyping = vi.hoisted(() => vi.fn());
vi.mock("@/context/websocket-context", () => ({
  useWebSocketContext: () => ({ sendTyping, isConnected: true }),
}));
const captchaExecute = vi.hoisted(() => vi.fn());
vi.mock("@/components/auth/captcha", () => ({
  Captcha: forwardRef(function TestCaptcha(
    props: { onVerify: (token: string) => void; onExpire: () => void; onError: () => void },
    ref
  ) {
    useImperativeHandle(ref, () => ({ execute: captchaExecute, reset: vi.fn() }));
    return (
      <div>
        <button onClick={() => props.onVerify("upload-token")}>Verify upload</button>
        <button onClick={props.onExpire}>Expire upload</button>
        <button onClick={props.onError}>Reject upload</button>
      </div>
    );
  }),
}));
vi.mock("@/lib/logger", () => ({ errorLog: vi.fn() }));
vi.mock("@/services/media.service", () => ({ mediaService: { refreshMediaUrl: vi.fn() } }));

type Props = ComponentProps<typeof ChatFooter>;
let query: ReturnType<typeof createQueryWrapper>;
function show(overrides: Partial<Props> = {}) {
  const props: Props = {
    replyTo: null,
    editMessage: null,
    attachmentMode: false,
    attachments: [],
    current: null,
    chat: { id: "chat", type: "private" } as Props["chat"],
    newMessageText: "Hello",
    textareaRef: createRef<HTMLTextAreaElement>(),
    setReplyTo: vi.fn(),
    setEditMessage: vi.fn(),
    setAttachmentMode: vi.fn(),
    setAttachments: vi.fn(),
    setNewMessageText: vi.fn(),
    onSendMessage: vi.fn(),
    showScrollButton: false,
    scrollToBottom: vi.fn(),
    onEditMessage: vi.fn().mockResolvedValue({}),
    isEditing: false,
    uploadMedia: vi.fn(),
    isUploading: false,
    uploadingFiles: [],
    setUploadingFiles: vi.fn(),
    uploadingKeysRef: { current: new Set() },
    ...overrides,
  };
  const view = render(<ChatFooter {...props} />, { wrapper: query.wrapper });
  return {
    ...view,
    props,
    send: () =>
      fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), { key: "Enter" }),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  query = createQueryWrapper();
  useUIStore.getState().reset();
});
afterEach(() => {
  query.client.clear();
  vi.useRealTimers();
});

describe("ChatFooter", () => {
  it.each([false, true])(
    "refreshes a broken image in an edit without replacing other attachments (failure=%s)",
    async (fails) => {
      const attachments = [
        { id: "image", url: "/expired.png", original_name: "photo.png", mime_type: "image/png" },
        {
          id: "document",
          url: "/keep.pdf",
          original_name: "notes.pdf",
          mime_type: "application/pdf",
        },
      ];
      if (fails)
        vi.mocked(mediaService.refreshMediaUrl).mockRejectedValueOnce(new Error("offline"));
      else vi.mocked(mediaService.refreshMediaUrl).mockResolvedValueOnce("/renewed.png");
      const { props, container } = show({
        attachmentMode: true,
        editMessage: { id: "edit", content: "Caption", attachments } as Props["editMessage"],
      });
      const image = container.querySelector('img[src="/expired.png"]');
      expect(image).not.toBeNull();
      fireEvent.error(image!);
      await waitFor(() => expect(mediaService.refreshMediaUrl).toHaveBeenCalledWith("image"));
      if (fails) {
        await waitFor(() =>
          expect(errorLog).toHaveBeenCalledWith(
            "Failed to refresh media in edit mode",
            expect.any(Error)
          )
        );
        expect(props.setEditMessage).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(props.setEditMessage).toHaveBeenCalledWith(
            expect.objectContaining({
              attachments: [{ ...attachments[0], url: "/renewed.png" }, attachments[1]],
            })
          )
        );
      }
    }
  );
  it.each(["Verify upload", "Expire upload", "Reject upload"])(
    "handles a late CAPTCHA callback without uploading a file: %s",
    (name) => {
      const { props } = show();
      fireEvent.click(screen.getByRole("button", { name }));
      expect(props.uploadMedia).not.toHaveBeenCalled();
      expect(useUIStore.getState().isBusy).toBe(false);
    }
  );
  it.each(["Renamed sender", "Deleted User", "", null])(
    "resolves reply identity from the real profile query: %s",
    async (fullName) => {
      query.client.setQueryData(["user", "sender-1"], { id: "sender-1", full_name: fullName });
      const { props, container } = show({
        replyTo: {
          id: "reply-1",
          sender_id: "sender-1",
          sender_name: "Old name",
          content: "Quoted content",
        } as Props["replyTo"],
      });
      expect(
        await screen.findByText(fullName === "Renamed sender" ? fullName : "Deleted Account")
      ).toBeInTheDocument();
      fireEvent.click(container.querySelector("button:has(svg.lucide-x)")!);
      expect(props.setReplyTo).toHaveBeenCalledWith(null);
    }
  );
  it("cancels an edit through the real preview and clears the composer", () => {
    const { props, container } = show({
      editMessage: {
        id: "edit-1",
        content: "Old content",
        attachments: [],
      } as Props["editMessage"],
    });
    fireEvent.click(container.querySelector("button:has(svg.lucide-x)")!);
    expect(props.setEditMessage).toHaveBeenCalledWith(null);
    expect(props.setNewMessageText).toHaveBeenCalledWith("");
    expect(props.setAttachmentMode).toHaveBeenCalledWith(false);
  });
  it("leaves an edit untouched when no conversation is available", async () => {
    const { props } = show({
      chat: undefined,
      editMessage: {
        id: "edit-1",
        content: "Old content",
        attachments: [],
      } as Props["editMessage"],
      newMessageText: "Changed content",
      setUploadingFiles: undefined,
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), { key: "Enter" });
    await act(async () => {});
    expect(props.onEditMessage).not.toHaveBeenCalled();
    expect(props.setEditMessage).not.toHaveBeenCalled();
  });
  it("renews an expired CAPTCHA for a queued file, then uploads using its verified token", async () => {
    const media = { id: "uploaded", original_name: "notes.txt", mime_type: "text/plain" } as Media;
    const { props, container } = show({
      attachmentMode: true,
      uploadMedia: vi.fn().mockResolvedValue(media),
    });
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(captchaExecute).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Expire upload" }));
    expect(captchaExecute).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Verify upload" }));
    await waitFor(() =>
      expect(props.uploadMedia).toHaveBeenCalledWith(
        expect.objectContaining({ file, usage: "message_attachment", captchaToken: "upload-token" })
      )
    );
    await waitFor(() => expect(useUIStore.getState().isBusy).toBe(false));
    const update = vi.mocked(props.setAttachments).mock.calls[0][0] as (
      previous: Media[]
    ) => Media[];
    expect(update([])).toEqual([media]);
  });
  it("removes a new attachment by identity without removing other selections", () => {
    const attachments = [
      { id: "a1", original_name: "first.pdf", mime_type: "application/pdf" },
      { id: "a2", original_name: "second.pdf", mime_type: "application/pdf" },
    ] as Media[];
    const { props } = show({ attachmentMode: true, attachments });
    const card = screen.getByText("first").closest('[data-slot="card"]')!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { hidden: true }));
    expect(props.setAttachments).toHaveBeenCalledWith([attachments[1]]);
  });
  it("marks only the selected retained attachment as deleted while preserving other edit metadata", () => {
    const attachments = [
      { id: "a1", original_name: "first.pdf", mime_type: "application/pdf" },
      { id: "a2", original_name: "second.pdf", mime_type: "application/pdf" },
    ] as Media[];
    const editMessage = { id: "m1", content: "Original", attachments } as Props["editMessage"];
    const { props } = show({ attachmentMode: true, editMessage });
    const card = screen.getByText("first").closest('[data-slot="card"]')!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { hidden: true }));
    expect(props.setEditMessage).toHaveBeenCalledWith({
      ...editMessage,
      attachments: [{ ...attachments[0], delete: true }, attachments[1]],
    });
  });
  it("enables attachment mode while clearing stale pending and retained attachments", () => {
    const retained = [
      { id: "old", original_name: "old.pdf", mime_type: "application/pdf" },
    ] as Media[];
    const { props, container } = show({
      editMessage: { id: "m1", content: "Hello", attachments: retained } as Props["editMessage"],
    });
    fireEvent.click(container.querySelector("button:has(svg.lucide-file)")!);
    expect(props.setAttachmentMode).toHaveBeenCalledWith(true);
    expect(props.setAttachments).toHaveBeenCalledWith([]);
    expect(props.setUploadingFiles).toHaveBeenCalledWith([]);
    expect(props.setEditMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [{ ...retained[0], delete: true }] })
    );
  });
  it("disables attachment mode without discarding its selected files", () => {
    const { props, container } = show({ attachmentMode: true });
    fireEvent.click(container.querySelector("button:has(svg.lucide-shredder)")!);
    expect(props.setAttachmentMode).toHaveBeenCalledWith(false);
    expect(props.setAttachments).not.toHaveBeenCalled();
  });
  it.each(["shiftKey", "ctrlKey", "metaKey", "altKey"])(
    "does not submit Enter with %s held",
    (modifier) => {
      const { props } = show();
      fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), {
        key: "Enter",
        [modifier]: true,
      });
      expect(props.onSendMessage).not.toHaveBeenCalled();
    }
  );
  it("does not submit while an IME composition is active", () => {
    const { props } = show();
    fireEvent.keyDown(screen.getByPlaceholderText("Type a message..."), {
      key: "Enter",
      isComposing: true,
    });
    expect(props.onSendMessage).not.toHaveBeenCalled();
  });
  it("sends the draft and completed attachments together", () => {
    const attachments = [
      { id: "a1", mime_type: "application/pdf", original_name: "notes.pdf" },
    ] as Media[];
    const { props, send } = show({ attachments });
    send();
    expect(props.onSendMessage).toHaveBeenCalledWith("Hello", attachments);
  });
  it("does not send whitespace-only content", () => {
    const { props, send } = show({ newMessageText: "  " });
    send();
    expect(props.onSendMessage).not.toHaveBeenCalled();
  });
  it("allows attachment-only messages", () => {
    const attachments = [
      { id: "a1", mime_type: "application/pdf", original_name: "notes.pdf" },
    ] as Media[];
    const { props, send } = show({ newMessageText: "", attachments });
    send();
    expect(props.onSendMessage).toHaveBeenCalledWith("", attachments);
  });
  it.each(["isUploading", "isSending", "isEditing"])(
    "marks the global UI busy during %s and clears it on unmount",
    (flag) => {
      const { props, unmount } = show({ [flag]: true });
      expect(useUIStore.getState().isBusy).toBe(true);
      const sendButton = screen.getByRole("button", {
        name: flag === "isSending" ? "Sending message" : "Send message",
      });
      expect(sendButton).toBeDisabled();
      fireEvent.click(sendButton);
      expect(props.onSendMessage).not.toHaveBeenCalled();
      unmount();
      expect(useUIStore.getState().isBusy).toBe(false);
    }
  );
  it("throttles typing notifications to once per three seconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    show();
    const input = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(input, { target: { value: "one" } });
    fireEvent.change(input, { target: { value: "two" } });
    expect(sendTyping).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(3001));
    fireEvent.change(input, { target: { value: "three" } });
    expect(sendTyping).toHaveBeenCalledTimes(2);
    expect(sendTyping).toHaveBeenLastCalledWith("chat");
  });
  it("does not publish typing for a virtual chat without an id", () => {
    show({ chat: undefined });
    fireEvent.change(screen.getByPlaceholderText("Type a message..."), {
      target: { value: "new" },
    });
    expect(sendTyping).not.toHaveBeenCalled();
  });
  it("closes an unchanged edit without making a request", () => {
    const { props, send } = show({
      editMessage: { id: "m1", content: " Hello ", attachments: [] } as Props["editMessage"],
    });
    send();
    expect(props.onEditMessage).not.toHaveBeenCalled();
    expect(props.setEditMessage).toHaveBeenCalledWith(null);
    expect(props.setNewMessageText).toHaveBeenCalledWith("");
    expect(props.setAttachments).toHaveBeenCalledWith([]);
  });
  it("combines retained and new attachments while excluding removed ones from an edit", async () => {
    const kept = {
      id: "kept",
      mime_type: "application/pdf",
      original_name: "keep.pdf",
      delete: false,
    };
    const added = { id: "new", mime_type: "application/pdf", original_name: "new.pdf" } as Media;
    const { props, send } = show({
      editMessage: {
        id: "m1",
        content: "Old",
        attachments: [kept, { ...kept, id: "removed", delete: true }],
      } as Props["editMessage"],
      attachments: [added],
    });
    send();
    await waitFor(() => expect(props.setEditMessage).toHaveBeenCalledWith(null));
    expect(props.onEditMessage).toHaveBeenCalledWith({
      messageId: "m1",
      chatId: "chat",
      data: { content: "Hello", attachment_ids: ["kept", "new"] },
      optimisticAttachments: [kept, added],
    });
    expect(props.onSendMessage).not.toHaveBeenCalled();
  });
  it("preserves the edit when saving fails", async () => {
    const onEditMessage = vi.fn().mockRejectedValue(new Error("Offline"));
    const { props, send } = show({
      editMessage: { id: "m1", content: "Old", attachments: [] } as Props["editMessage"],
      onEditMessage,
    });
    send();
    await waitFor(() => expect(onEditMessage).toHaveBeenCalled());
    expect(props.setEditMessage).not.toHaveBeenCalled();
    expect(props.setNewMessageText).not.toHaveBeenCalled();
  });
  it("cannot save an edit after removing all content and attachments", () => {
    const { props, send } = show({
      newMessageText: " ",
      editMessage: { id: "m1", content: "Old", attachments: [] } as Props["editMessage"],
    });
    send();
    expect(props.onEditMessage).not.toHaveBeenCalled();
  });
  it.each([
    ["deleted", "This account has been deleted."],
    ["banned", "This user has been banned."],
    ["blockedByMe", "You have blocked this user."],
    ["blockedByOther", "You have been blocked by this user."],
  ])("replaces the composer for a %s partner", (kind, text) => {
    show({
      chat: {
        id: "chat",
        type: "private",
        other_user_is_deleted: kind === "deleted",
        other_user_is_banned: kind === "banned",
      } as Props["chat"],
      partnerProfile: {
        is_blocked_by_me: kind === "blockedByMe",
        is_blocked_by_other: kind === "blockedByOther",
      } as Props["partnerProfile"],
    });
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
