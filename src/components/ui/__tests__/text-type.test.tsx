import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TextType from "../text-type";

vi.mock("gsap", () => ({ gsap: { set: vi.fn(), to: vi.fn() } }));

describe("TextType animation lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const advance = async (ms: number) => {
    await act(() => vi.advanceTimersByTimeAsync(ms));
  };

  it("respects the initial delay and types one character at a time without looping", async () => {
    const view = render(
      <TextType text="Hi" typingSpeed={20} initialDelay={100} loop={false} showCursor={false} />
    );
    const content = view.container.querySelector(".text-type__content")!;
    await advance(100);
    expect(content).toHaveTextContent("");
    await advance(20);
    expect(content).toHaveTextContent("H");
    await advance(20);
    expect(content).toHaveTextContent("Hi");
    await advance(10000);
    expect(content).toHaveTextContent("Hi");
  });
  it("types reversed text and forwards semantic element attributes", async () => {
    const view = render(
      <TextType
        as="h2"
        aria-label="Greeting"
        text="abc"
        reverseMode
        typingSpeed={10}
        loop={false}
        showCursor={false}
      />
    );
    for (let i = 0; i < 4; i++) await advance(10);
    expect(view.getByRole("heading", { name: "Greeting" })).toHaveTextContent("cba");
  });
  it("deletes a completed sentence before changing text and color", async () => {
    const complete = vi.fn();
    const view = render(
      <TextType
        text={["A", "B"]}
        typingSpeed={10}
        deletingSpeed={5}
        pauseDuration={20}
        textColors={["red", "blue"]}
        onSentenceComplete={complete}
        showCursor={false}
      />
    );
    const content = view.container.querySelector(".text-type__content")!;
    await advance(10);
    expect(content).toHaveTextContent("A");
    expect(content).toHaveStyle({ color: "rgb(255, 0, 0)" });
    await advance(20);
    await advance(5);
    expect(complete).toHaveBeenCalledWith("A", 0);
    expect(content).toHaveTextContent("");
    expect(content).toHaveStyle({ color: "rgb(0, 0, 255)" });
    await advance(10);
    expect(content).toHaveTextContent("B");
  });
  it("hides the cursor while typing and exposes it when the sentence is complete", async () => {
    const view = render(
      <TextType
        text="A"
        typingSpeed={10}
        loop={false}
        hideCursorWhileTyping
        cursorCharacter="_"
        cursorClassName="custom-cursor"
      />
    );
    const cursor = view.container.querySelector(".text-type__cursor")!;
    expect(cursor).toHaveClass("text-type__cursor--hidden", "custom-cursor");
    expect(cursor).toHaveTextContent("_");
    await advance(10);
    expect(cursor).not.toHaveClass("text-type__cursor--hidden");
  });
  it("uses the configured variable speed interval", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const view = render(
      <TextType text="X" variableSpeed={{ min: 10, max: 30 }} loop={false} showCursor={false} />
    );
    await advance(19);
    expect(view.container).toHaveTextContent("");
    await advance(1);
    expect(view.container).toHaveTextContent("X");
  });
  it("waits for visibility and disconnects its observer on unmount", async () => {
    let notify: IntersectionObserverCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      }
    );
    const view = render(
      <TextType text="A" startOnVisible typingSpeed={10} loop={false} showCursor={false} />
    );
    await advance(100);
    expect(view.container).toHaveTextContent("");
    act(() =>
      notify!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    );
    await advance(100);
    expect(view.container).toHaveTextContent("");
    act(() =>
      notify!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    );
    await advance(10);
    expect(view.container).toHaveTextContent("A");
    expect(observe).toHaveBeenCalledOnce();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
  it("cancels pending typing when unmounted", async () => {
    const view = render(<TextType text="Long text" initialDelay={1000} showCursor={false} />);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
