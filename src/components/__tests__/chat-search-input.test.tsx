import { ChatSearchInput } from "@/components/chat-search-input";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("ChatSearchInput", () => {
  it("does not call onSearch when disabled", () => {
    const onSearch = vi.fn();

    render(<ChatSearchInput onSearch={onSearch} disabled />);

    const input = screen.getByPlaceholderText("Search chats...");

    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { value: "hello" } });

    expect(onSearch).not.toHaveBeenCalled();
  });
});
