import { ChatListItem, User } from "@/types";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQueryWrapper } from "../../../../test/query-wrapper";
import { ChatPreviewText } from "../chat-preview-text";

describe("conversation last-message preview", () => {
  let context: ReturnType<typeof createQueryWrapper>;
  beforeEach(() => {
    context = createQueryWrapper();
  });
  afterEach(() => {
    cleanup();
    context.client.clear();
  });
  function setup(
    message: Record<string, unknown> | null,
    type = "group",
    currentUser: User | null = { id: "u1" } as User
  ) {
    return render(
      <ChatPreviewText
        chat={
          {
            type,
            last_message: message && {
              id: "m1",
              sender_id: "u2",
              sender_name: "Ada",
              type: "text",
              content: "Hello",
              ...message,
            },
          } as ChatListItem
        }
        currentUser={currentUser}
      />,
      { wrapper: context.wrapper }
    );
  }
  it("explains that a chat has no messages", () => {
    setup(null);
    expect(screen.getByText("No messages")).toBeVisible();
  });
  it.each(["file", "unknown"])("labels an own captionless %s preview as You", (type) => {
    setup({ sender_id: "u1", type, content: "" });
    expect(screen.getByText("You")).toBeVisible();
    expect(screen.getByText("File")).toBeVisible();
  });
  it("retains the sender name on a deleted incoming group message", () => {
    setup({ deleted_at: "2026-01-01", content: "Secret" });
    expect(screen.getByText("Ada")).toBeVisible();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
  it("falls back to event names when cached profiles have no display name", () => {
    context.client.setQueryData(["user", "u2"], { full_name: null });
    context.client.setQueryData(["user", "u3"], { full_name: null });
    setup({ type: "system_add", action_data: { target_id: "u3", target_name: "Grace" } });
    expect(screen.getByText(/Ada/)).toHaveTextContent("Grace");
  });
  it.each(["group", "private"])(
    "shows text without leaking a sender prefix into a %s chat",
    (type) => {
      setup({}, type);
      expect(screen.getByText("Hello")).toBeVisible();
      expect(!!screen.queryByText("Ada")).toBe(type === "group");
    }
  );
  it("prefers the cached sender name and labels own messages as You", () => {
    context.client.setQueryData(["user", "u2"], { full_name: "Updated Ada" });
    const view = setup({});
    expect(screen.getByText("Updated Ada")).toBeVisible();
    view.unmount();
    setup({ sender_id: "u1" });
    expect(screen.getByText("You")).toBeVisible();
  });
  it.each([{ sender_id: null }, { sender_name: null }])(
    "marks a missing sender as a deleted account: %j",
    (message) => {
      setup(message, "group", null);
      expect(screen.getByText("Deleted Account")).toBeVisible();
    }
  );
  it.each(["group", "private"])("hides deleted message content in a %s preview", (type) => {
    setup({ deleted_at: "2026-01-01", sender_id: "u1", content: "Secret" }, type);
    expect(screen.getByText("Message deleted")).toBeVisible();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
    expect(!!screen.queryByText("You")).toBe(type === "group");
  });
  it.each(["file", "image", "video", "audio", "text", "unknown"])(
    "renders a captionless %s message as a file preview",
    (type) => {
      setup({ type, content: "", attachments: type === "text" ? [{ id: "a1" }] : [] });
      expect(screen.getByText("File")).toBeVisible();
      expect(screen.getByText("Ada")).toBeVisible();
    }
  );
  it("resolves cached actor and target names for system messages", () => {
    context.client.setQueryData(["user", "u2"], { full_name: "Updated Ada" });
    context.client.setQueryData(["user", "u3"], { full_name: "Updated Grace" });
    setup({
      type: "system_add",
      content: "",
      action_data: { target_id: "u3", target_name: "Old Grace" },
    });
    expect(screen.getByText(/Updated Ada/)).toHaveTextContent("Updated Grace");
    expect(screen.queryByText(/Old Grace/)).not.toBeInTheDocument();
  });
  it("uses deleted-account names for a system event without usable identities", () => {
    setup({ type: "system_add", sender_id: null, action_data: {} }, "group", null);
    expect(screen.getByText(/Deleted Account/)).toBeVisible();
  });
});
