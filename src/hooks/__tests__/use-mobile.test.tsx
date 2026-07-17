import { useIsMobile } from "@/hooks/use-mobile";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

const originalInnerWidth = window.innerWidth;

describe("useIsMobile", () => {
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("returns the mobile state on the first render", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    const seenValues: boolean[] = [];

    function Probe() {
      seenValues.push(useIsMobile());
      return null;
    }

    render(<Probe />);

    expect(seenValues[0]).toBe(true);
  });
});
