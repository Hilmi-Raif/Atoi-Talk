import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlobalLightbox } from "../lightbox";

vi.mock("yet-another-react-lightbox", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="lightbox" /> : null),
}));
vi.mock("yet-another-react-lightbox/plugins/thumbnails", () => ({ default: {} }));
vi.mock("yet-another-react-lightbox/plugins/zoom", () => ({ default: {} }));

describe("GlobalLightbox back button navigation", () => {
  it("pushes history on open and closes immediately on popstate without double-popping", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const backSpy = vi.spyOn(window.history, "back");
    const close = vi.fn();

    const { rerender } = render(<GlobalLightbox open={false} close={close} slides={[]} />);
    expect(pushSpy).not.toHaveBeenCalled();

    rerender(<GlobalLightbox open={true} close={close} slides={[{ src: "img.jpg" }]} />);
    expect(pushSpy).toHaveBeenCalledTimes(1);

    // simulate mobile back button
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(close).toHaveBeenCalledTimes(1);

    // closing after popstate must not navigate back again
    rerender(<GlobalLightbox open={false} close={close} slides={[{ src: "img.jpg" }]} />);
    expect(backSpy).not.toHaveBeenCalled();

    pushSpy.mockRestore();
    backSpy.mockRestore();
  });

  it("calls history.back if closed via UI close button rather than popstate", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    const backSpy = vi.spyOn(window.history, "back");
    const close = vi.fn();

    // seed an open lightbox history entry
    window.history.pushState({ lightboxOpen: true }, "");

    const { rerender } = render(
      <GlobalLightbox open={true} close={close} slides={[{ src: "img.jpg" }]} />
    );

    // close through the interface without popstate
    rerender(<GlobalLightbox open={false} close={close} slides={[{ src: "img.jpg" }]} />);
    expect(backSpy).toHaveBeenCalled();

    pushSpy.mockRestore();
    backSpy.mockRestore();
  });
});
