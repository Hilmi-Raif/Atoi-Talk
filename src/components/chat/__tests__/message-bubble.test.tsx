import { toast } from "@/lib/toast";
import { userService } from "@/services";
import { useUIStore } from "@/store";
import { type Message, type User } from "@/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import MessageBubble from "../message-bubble";

vi.mock("@/services", () => ({ userService: { getUserById: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));

type Props = ComponentProps<typeof MessageBubble>;
const current: User = {
  id: "self",
  full_name: "Me",
  email: "me@example.com",
  username: "me",
  avatar: null,
  bio: null,
  has_password: true,
};
let query: ReturnType<typeof createQueryWrapper>;
function show(overrides: Partial<Props> = {}) {
  const props: Props = {
    message: {
      id: "m1",
      sender_id: "self",
      sender_name: "Me",
      content: "Hello world",
      created_at: new Date().toISOString(),
      attachments: [],
    } as unknown as Message,
    current,
    chat: { id: "chat", type: "private", name: "Alice" } as Props["chat"],
    activeMessageId: "m1",
    editMessage: null,
    messageRefs: { current: {} },
    isLoadingMessage: false,
    isError: false,
    handleClick: vi.fn(),
    setEditMessage: vi.fn(),
    setNewMessageText: vi.fn(),
    setAttachmentMode: vi.fn(),
    textareaRef: { current: document.createElement("textarea") },
    setReplyTo: vi.fn(),
    setMessageToDelete: vi.fn(),
    setShowDeleteModal: vi.fn(),
    setAttachments: vi.fn(),
    jumpToMessage: vi.fn(),
    highlightedMessageId: null,
    isBusy: false,
    ...overrides,
  };
  const view = render(<MessageBubble {...props} />, { wrapper: query.wrapper });
  const action = (icon: string) =>
    view.container.querySelector(`button:has(svg.lucide-${icon})`) as HTMLButtonElement | null;
  return { ...view, props, action };
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

describe("MessageBubble", () => {
  it.each(["read", "delivered", "sent"] as const)(
    "renders the %s receipt for an acknowledged private message",
    (state) => {
      const created = "2026-01-01T12:00:00Z";
      const { container } = show({
        message: {
          id: "m1",
          sender_id: "self",
          content: "Receipt",
          created_at: created,
        } as Message,
        chat: {
          id: "chat",
          type: "private",
          other_last_read_at: state === "read" ? created : null,
        } as Props["chat"],
        partnerProfile: { is_online: state === "delivered" } as User,
      });
      const receipt = container.querySelector(
        state === "sent" ? "svg.lucide-check" : "svg.lucide-check-check"
      );
      expect(receipt).toBeInTheDocument();
      if (state !== "sent")
        expect(receipt).toHaveClass(state === "read" ? "text-blue-500" : "text-muted-foreground");
    }
  );
  it.each(["owner", "admin"] as const)(
    "shows the group sender's %s badge without private receipts",
    (role) => {
      const { container } = show({
        message: {
          id: "m1",
          sender_id: "other",
          sender_name: "Ada",
          sender_role: role,
          content: "Edited",
          edited_at: "2026-01-01",
          created_at: "2026-01-01",
        } as Message,
        chat: { id: "g", type: "group", my_role: "member" } as Props["chat"],
      });
      expect(container.querySelector("svg.lucide-shield")).toHaveClass(
        role === "owner" ? "text-yellow-500" : "text-blue-500"
      );
      expect(screen.getByText("edited")).toHaveClass("text-muted-foreground/90");
      expect(container.querySelector("svg.lucide-check-check")).not.toBeInTheDocument();
    }
  );
  it("keeps a deleted incoming message as a tombstone without report or reply actions", () => {
    const { action } = show({
      message: {
        id: "m1",
        sender_id: "other",
        content: "Secret",
        deleted_at: "2026-01-02",
        created_at: "2026-01-01",
      } as Message,
    });
    expect(screen.getByText("Message deleted")).toHaveClass("text-muted-foreground/80");
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(action("flag")).toBeNull();
    expect(action("reply")).toBeNull();
  });
  it.each(["self", "other"])(
    "renders an arriving image message from %s with the image layout",
    (sender_id) => {
      const { container } = show({
        isNewMessage: true,
        message: {
          id: "m1",
          sender_id,
          sender_name: "Ada",
          content: "",
          created_at: new Date().toISOString(),
          attachments: [
            { id: "image", mime_type: "image/png", original_name: "photo.png", url: "/photo.png" },
          ],
        } as Message,
      });
      expect(container.querySelector("#message-m1")).toHaveClass("md:w-[60%]");
      expect(screen.getByRole("img")).toBeInTheDocument();
    }
  );
  it.each(["self", "other"])("can reply to %s while the composer is unmounted", (sender_id) => {
    const { action, props } = show({
      textareaRef: { current: null },
      editMessage: { id: "old" } as Props["editMessage"],
      message: {
        id: "m1",
        sender_id,
        sender_name: "Ada",
        content: "Reply",
        created_at: new Date().toISOString(),
      } as Message,
    });
    fireEvent.click(action("reply")!);
    expect(props.setEditMessage).toHaveBeenCalledWith(null);
    expect(props.setReplyTo).toHaveBeenCalledWith(props.message);
  });
  it("edits an attachment-free empty caption without a mounted composer", () => {
    const { action, props } = show({
      textareaRef: { current: null },
      message: {
        id: "m1",
        sender_id: "self",
        content: "",
        created_at: new Date().toISOString(),
      } as Message,
    });
    fireEvent.click(action("square-pen")!);
    expect(props.setEditMessage).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
    expect(props.setNewMessageText).toHaveBeenLastCalledWith("");
  });
  it("registers its DOM node and handles bubble selection", () => {
    const { props, container, unmount } = show();
    expect(props.messageRefs.current.m1).toBe(container.querySelector("#message-m1"));
    fireEvent.click(screen.getByText("Hello world"));
    expect(props.handleClick).toHaveBeenCalledWith("m1");
    unmount();
    expect(props.messageRefs.current.m1).toBeNull();
  });
  it("opens links safely without selecting the message", () => {
    const { props } = show({
      message: {
        id: "m1",
        sender_id: "self",
        content: "Visit https://example.com/docs now",
        created_at: new Date().toISOString(),
      } as Message,
    });
    const link = screen.getByRole("link", { name: "https://example.com/docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    fireEvent.click(link);
    expect(props.handleClick).not.toHaveBeenCalled();
  });
  it("starts editing with attachments marked as retained and clears a pending reply", () => {
    const attachment = {
      id: "a1",
      mime_type: "application/pdf",
      original_name: "notes.pdf",
      file_url: "/notes.pdf",
    };
    const { props, action } = show({
      message: {
        id: "m1",
        sender_id: "self",
        content: "Caption",
        created_at: new Date().toISOString(),
        attachments: [attachment],
      } as Message,
    });
    fireEvent.click(action("square-pen")!);
    expect(props.setAttachments).toHaveBeenCalledWith([]);
    expect(props.setReplyTo).toHaveBeenCalledWith(null);
    expect(props.setEditMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [{ ...attachment, delete: false }] })
    );
    expect(props.setAttachmentMode).toHaveBeenLastCalledWith(true);
    expect(props.setNewMessageText).toHaveBeenLastCalledWith("Caption");
    expect(props.textareaRef.current?.value).toBe("Caption");
    expect(props.handleClick).not.toHaveBeenCalled();
  });
  it("edits an attachment-free message without enabling attachment mode", () => {
    const { props, action } = show();
    fireEvent.click(action("square-pen")!);
    expect(props.setEditMessage).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
    expect(props.setAttachmentMode).toHaveBeenLastCalledWith(false);
  });
  it.each(["self", "other"])("replying to %s cancels an active edit", (sender_id) => {
    vi.useFakeTimers();
    const { props, action } = show({
      message: {
        id: "m1",
        sender_id,
        content: "Reply here",
        created_at: new Date().toISOString(),
      } as Message,
      editMessage: { id: "editing" } as Props["editMessage"],
    });
    props.textareaRef.current!.value = "old draft";
    fireEvent.click(action("reply")!);
    expect(props.setEditMessage).toHaveBeenCalledWith(null);
    expect(props.setNewMessageText).toHaveBeenCalledWith("");
    expect(props.setAttachmentMode).toHaveBeenCalledWith(false);
    expect(props.textareaRef.current?.value).toBe("");
    expect(props.setReplyTo).toHaveBeenCalledWith(props.message);
    vi.runOnlyPendingTimers();
  });
  it("requests confirmation before deleting an own message", () => {
    const { action, props } = show();
    fireEvent.click(action("trash-2")!);
    expect(props.setMessageToDelete).toHaveBeenCalledWith("m1");
    expect(props.setShowDeleteModal).toHaveBeenCalledWith(true);
    expect(props.handleClick).not.toHaveBeenCalled();
  });
  it("does not offer edit after the fifteen minute window", () => {
    const { action } = show({
      message: {
        id: "m1",
        sender_id: "self",
        created_at: new Date(Date.now() - 900001).toISOString(),
        content: "Old",
      } as Message,
    });
    expect(action("square-pen")).toBeNull();
    expect(action("reply")).not.toBeNull();
    expect(action("trash-2")).not.toBeNull();
  });
  it.each([
    "is_blocked_by_me",
    "is_blocked_by_other",
    "other_user_is_deleted",
    "other_user_is_banned",
  ])("disables reply and edit for %s while retaining own deletion", (flag) => {
    const { action } = show({
      chat: { id: "chat", type: "private", [flag]: true } as Props["chat"],
    });
    expect(action("square-pen")).toBeNull();
    expect(action("reply")).toBeNull();
    expect(action("trash-2")).not.toBeNull();
  });
  it("also blocks interaction when the live partner profile is banned", () => {
    const { action } = show({ partnerProfile: { ...current, id: "other", is_banned: true } });
    expect(action("reply")).toBeNull();
    expect(action("square-pen")).toBeNull();
  });
  it("renders a tombstone without revealing deleted content or actions", () => {
    const { action } = show({
      message: {
        id: "m1",
        sender_id: "self",
        content: "Secret",
        created_at: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
        edited_at: new Date().toISOString(),
      } as Message,
    });
    expect(screen.getByText("Message deleted")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(screen.queryByText("edited")).not.toBeInTheDocument();
    expect(action("trash-2")).toBeNull();
  });
  it("shows edited status and selection highlight for a live message", () => {
    const { container } = show({
      highlightedMessageId: "m1",
      message: {
        id: "m1",
        sender_id: "self",
        content: "Updated",
        created_at: new Date().toISOString(),
        edited_at: new Date().toISOString(),
      } as Message,
    });
    expect(screen.getByText("edited")).toBeInTheDocument();
    expect(container.querySelector(".ring-blue-500")).not.toBeNull();
  });
  it("disables every action while another operation is busy", () => {
    const { container } = show({ isBusy: true });
    for (const button of container.querySelectorAll("button")) expect(button).toBeDisabled();
  });
  it.each(["admin", "owner", "member"])(
    "offers moderation deletion only to authorized group role %s",
    (role) => {
      const { action } = show({
        chat: { id: "chat", type: "group", my_role: role } as Props["chat"],
        message: {
          id: "m1",
          sender_id: "other",
          sender_name: "Alice",
          content: "Group message",
          created_at: new Date().toISOString(),
        } as Message,
      });
      expect(Boolean(action("trash-2"))).toBe(role !== "member");
      if (role !== "member") fireEvent.click(action("trash-2")!);
    }
  );
  it("prefers cached group sender names and opens the fetched profile", async () => {
    query.client.setQueryData(["user", "other"], {
      ...current,
      id: "other",
      full_name: "Fresh Alice",
    });
    vi.mocked(userService.getUserById).mockResolvedValue({
      ...current,
      id: "other",
      full_name: "Fresh Alice",
    });
    show({
      chat: { id: "group", type: "group" } as Props["chat"],
      message: {
        id: "m1",
        sender_id: "other",
        sender_name: "Old Alice",
        sender_role: "owner",
        created_at: new Date().toISOString(),
        content: "Hi",
      } as Message,
    });
    fireEvent.click(screen.getByText("Fresh Alice"));
    await waitFor(() =>
      expect(useUIStore.getState().profileModal).toMatchObject({ isOpen: true, userId: "other" })
    );
    expect(useUIStore.getState().isLoadingProfile).toBe(false);
  });
  it("reports a profile failure and clears the loading state", async () => {
    vi.mocked(userService.getUserById).mockRejectedValue(new Error("Offline"));
    show({
      chat: { id: "group", type: "group" } as Props["chat"],
      message: {
        id: "m1",
        sender_id: "other",
        sender_name: "Alice",
        created_at: new Date().toISOString(),
        content: "Hi",
      } as Message,
    });
    fireEvent.click(screen.getByText("Alice"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to load user profile"));
    expect(useUIStore.getState().isLoadingProfile).toBe(false);
  });
  it("does not fetch profiles for deleted group senders", () => {
    show({
      chat: { id: "group", type: "group" } as Props["chat"],
      message: {
        id: "m1",
        sender_id: "",
        sender_name: "",
        created_at: new Date().toISOString(),
        content: "Hi",
      } as Message,
    });
    fireEvent.click(screen.getByText("Deleted Account"));
    expect(userService.getUserById).not.toHaveBeenCalled();
  });
  it.each(["loading", "error"])("suppresses delivery receipts for %s messages", (state) => {
    const { container, action } = show({
      isLoadingMessage: state === "loading",
      isError: state === "error",
    });
    expect(container.querySelector("svg.lucide-check")).toBeNull();
    expect(container.querySelector("svg.lucide-check-check")).toBeNull();
    if (state === "loading") expect(action("trash-2")).toBeNull();
    else expect(container.querySelector("svg.lucide-circle-alert")).not.toBeNull();
  });
});
