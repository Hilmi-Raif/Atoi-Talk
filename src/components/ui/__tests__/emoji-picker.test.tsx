import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from "../emoji-picker";

beforeEach(() => {
  sessionStorage.setItem(
    "frimousse/metadata",
    JSON.stringify({ emojiVersion: 16, countryFlags: true })
  );
  localStorage.setItem(
    "frimousse/data/en",
    JSON.stringify({
      data: {
        locale: "en",
        emojis: [{ emoji: "😀", category: 0, version: 1, label: "Grinning face", tags: ["happy"] }],
        categories: [{ index: 0, label: "Smileys" }],
        skinTones: {
          light: "Light",
          "medium-light": "Medium light",
          medium: "Medium",
          "medium-dark": "Medium dark",
          dark: "Dark",
        },
      },
      metadata: { emojisEtag: "test", messagesEtag: "test" },
    })
  );
});
afterEach(() => {
  cleanup();
  sessionStorage.removeItem("frimousse/metadata");
  localStorage.removeItem("frimousse/data/en");
});

it("searches cached emoji data and reports an empty result without network access", async () => {
  const selected = vi.fn();
  render(
    <EmojiPicker onEmojiSelect={selected} emojiVersion={16}>
      <EmojiPickerSearch aria-label="Search emoji" />
      <EmojiPickerContent />
      <EmojiPickerFooter />
    </EmojiPicker>
  );
  expect(await screen.findByText("Select an emoji…")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search emoji" }), {
    target: { value: "unfindable" },
  });
  expect(await screen.findByText("No emoji found.")).toBeVisible();
  expect(selected).not.toHaveBeenCalled();
});

it("selects a visible emoji and previews its label on pointer entry", async () => {
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.hasAttribute("frimousse-viewport") ? 200 : 28;
    },
  });
  const selected = vi.fn();
  try {
    render(
      <EmojiPicker onEmojiSelect={selected} emojiVersion={16}>
        <EmojiPickerSearch aria-label="Search emoji" />
        <EmojiPickerContent />
        <EmojiPickerFooter />
      </EmojiPicker>
    );
    const emoji = await screen.findByRole("gridcell", { name: "Grinning face" });
    fireEvent.pointerEnter(emoji);
    await waitFor(() =>
      expect(document.querySelector('[data-slot="emoji-picker-footer"]')).toHaveTextContent(
        "Grinning face"
      )
    );
    fireEvent.click(emoji);
    expect(selected).toHaveBeenCalledWith({ emoji: "😀", label: "Grinning face" });
    fireEvent.pointerLeave(emoji);
    expect(await screen.findByText("Select an emoji…")).toBeVisible();
  } finally {
    cleanup();
    if (height) Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  }
});
