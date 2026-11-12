import type { Message } from "@/types";
import { describe, expect, it } from "vitest";
import { getSystemMessageText } from "../system-message-utils";

const makeMsg = (overrides: Partial<Message>): Message =>
  ({
    id: "msg-1",
    chat_id: "chat-1",
    sender_id: "user-a",
    sender_name: "Alice",
    content: null,
    type: "text",
    action_data: {},
    created_at: new Date().toISOString(),
    ...overrides,
  }) as Message;

describe("getSystemMessageText", () => {
  it("formats legacy system events with absent action metadata", () => {
    expect(getSystemMessageText(makeMsg({ type: "system_create", action_data: undefined }))).toBe(
      'Alice created group "Group"'
    );
  });
  it("system_create — shows group creation", () => {
    const msg = makeMsg({
      type: "system_create",
      action_data: { actor_name: "Alice", initial_name: "Study Group" },
    });
    expect(getSystemMessageText(msg)).toBe('Alice created group "Study Group"');
  });

  it("system_create — uses 'You' for current user", () => {
    const msg = makeMsg({
      type: "system_create",
      sender_id: "me",
      action_data: { initial_name: "My Group" },
    });
    expect(getSystemMessageText(msg, "me")).toBe('You created group "My Group"');
  });

  it("system_create — falls back to 'Group' if no initial_name", () => {
    const msg = makeMsg({ type: "system_create" });
    expect(getSystemMessageText(msg)).toContain('"Group"');
  });

  it("system_rename — shows new name", () => {
    const msg = makeMsg({
      type: "system_rename",
      action_data: { actor_name: "Bob", new_name: "New Name" },
    });
    expect(getSystemMessageText(msg)).toBe('Bob changed group name to "New Name"');
  });

  it("system_description — shows description update", () => {
    const msg = makeMsg({
      type: "system_description",
      action_data: { actor_name: "Bob" },
    });
    expect(getSystemMessageText(msg)).toBe("Bob updated group description");
  });

  it("system_avatar — shows icon update", () => {
    const msg = makeMsg({
      type: "system_avatar",
      action_data: { actor_name: "Bob" },
    });
    expect(getSystemMessageText(msg)).toBe("Bob updated group icon");
  });

  it("system_add — shows added member", () => {
    const msg = makeMsg({
      type: "system_add",
      action_data: { actor_name: "Alice", target_id: "user-b", target_name: "Bob" },
    });
    expect(getSystemMessageText(msg)).toBe("Alice added Bob");
  });

  it("system_add — 'You' as target when target is current user", () => {
    const msg = makeMsg({
      type: "system_add",
      action_data: { actor_name: "Alice", target_id: "me", target_name: "Me" },
    });
    expect(getSystemMessageText(msg, "me")).toBe("Alice added You");
  });

  it("system_leave — shows user left", () => {
    const msg = makeMsg({
      type: "system_leave",
      action_data: { actor_name: "Charlie" },
    });
    expect(getSystemMessageText(msg)).toBe("Charlie left the group");
  });

  it("system_kick — shows removed member", () => {
    const msg = makeMsg({
      type: "system_kick",
      action_data: { actor_name: "Alice", target_id: "user-b", target_name: "Bob" },
    });
    expect(getSystemMessageText(msg)).toBe("Alice removed Bob");
  });

  it("system_promote — shows promotion with role", () => {
    const msg = makeMsg({
      type: "system_promote",
      action_data: {
        actor_name: "Alice",
        target_id: "user-b",
        target_name: "Bob",
        new_role: "admin",
      },
    });
    expect(getSystemMessageText(msg)).toBe("Alice promoted Bob to admin");
  });

  it("system_demote — shows demotion with role", () => {
    const msg = makeMsg({
      type: "system_demote",
      action_data: {
        actor_name: "Alice",
        target_id: "user-b",
        target_name: "Bob",
        new_role: "member",
      },
    });
    expect(getSystemMessageText(msg)).toBe("Alice demoted Bob to member");
  });

  it("system_transfer — shows transfer", () => {
    const msg = makeMsg({
      type: "system_transfer",
      action_data: { actor_name: "Alice", target_id: "user-b", target_name: "Bob" },
    });
    expect(getSystemMessageText(msg)).toBe("Alice transferred ownership to Bob");
  });

  it("system_visibility — shows visibility change", () => {
    const msg = makeMsg({
      type: "system_visibility",
      action_data: { actor_name: "Alice", new_visibility: "public" },
    });
    expect(getSystemMessageText(msg)).toBe("Alice made the group public");
  });

  it("system_join — shows user joined", () => {
    const msg = makeMsg({
      type: "system_join",
      action_data: { actor_name: "Charlie" },
    });
    expect(getSystemMessageText(msg)).toBe("Charlie joined the group");
  });

  it("unknown type — falls back to content", () => {
    const msg = makeMsg({
      type: "unknown_event" as Message["type"],
      content: "Something happened",
    });
    expect(getSystemMessageText(msg)).toBe("Something happened");
  });

  it("unknown type — falls back to 'System notification' if no content", () => {
    const msg = makeMsg({
      type: "unknown_event" as Message["type"],
      content: null,
    });
    expect(getSystemMessageText(msg)).toBe("System notification");
  });

  it("uses sender_name as fallback when actor_name is missing", () => {
    const msg = makeMsg({
      type: "system_leave",
      sender_name: "Dave",
      action_data: {},
    });
    expect(getSystemMessageText(msg)).toBe("Dave left the group");
  });

  it("uses 'User' fallback when no names available", () => {
    const msg = makeMsg({
      type: "system_add",
      sender_id: "other",
      sender_name: undefined as unknown as string,
      action_data: {},
    });
    const result = getSystemMessageText(msg);
    expect(result).toContain("User");
  });
});
