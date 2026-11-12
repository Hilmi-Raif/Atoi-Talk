import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { ChatMessageList } from "../chat-message-list";
vi.mock("../chat-loading", () => ({
  ChatLoading: () => <div role="status">Preparing messages</div>,
}));
vi.mock("../message-bubble", () => ({ default: () => <div>Message content</div> }));
vi.mock("../system-message", () => ({ SystemMessage: () => null, SystemMessageBadge: () => null }));
vi.mock("virtua", () => ({
  VList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const props = {
  chat: { id: "chat-a", type: "private" },
  items: [{ type: "message", id: "m-a", message: { id: "m-a", type: "text" } }],
  messageRefs: { current: {} },
  isReadyToDisplay: false,
  isRefetching: true,
} as ComponentProps<typeof ChatMessageList>;
it("keeps the initial loader continuous until message layout is ready", () => {
  const view = render(<ChatMessageList {...props} />);
  expect(screen.getByRole("status")).toHaveTextContent("Preparing messages");
  view.rerender(<ChatMessageList {...props} isRefetching={false} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  view.rerender(<ChatMessageList {...props} isReadyToDisplay isRefetching />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
