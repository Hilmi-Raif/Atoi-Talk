import { Captcha, type CaptchaHandle } from "@/components/auth/captcha";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecute, mockGetResponse, mockReset, mockSetCaptchaToken, mockTurnstileProps } =
  vi.hoisted(() => ({
    mockExecute: vi.fn(),
    mockGetResponse: vi.fn(() => "captcha-response"),
    mockReset: vi.fn(),
    mockSetCaptchaToken: vi.fn(),
    mockTurnstileProps: [] as any[],
  }));

vi.mock("@/store", () => ({
  useAuthStore: (selector: any) =>
    selector({
      captchaToken: null,
      setCaptchaToken: mockSetCaptchaToken,
    }),
}));

vi.mock("@marsidev/react-turnstile", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    Turnstile: React.forwardRef((props: any, ref) => {
      mockTurnstileProps.push(props);
      React.useImperativeHandle(ref, () => ({
        execute: mockExecute,
        getResponse: mockGetResponse,
        reset: mockReset,
      }));
      return <div data-testid="turnstile" />;
    }),
  };
});

describe("Captcha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstileProps.length = 0;
  });

  it("configures execute mode without executing on mount", () => {
    const ref = createRef<CaptchaHandle>();
    const onVerify = vi.fn();

    render(<Captcha ref={ref} mode="execute" onVerify={onVerify} />);

    expect(mockTurnstileProps[0].options).toMatchObject({
      appearance: "execute",
      execution: "execute",
      refreshExpired: "manual",
      refreshTimeout: "manual",
      retry: "auto",
      retryInterval: 8000,
    });
    expect(onVerify).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();

    act(() => {
      mockTurnstileProps[0].onWidgetLoad("widget-id");
    });

    act(() => {
      ref.current?.execute();
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("queues execute calls until the widget has loaded", () => {
    const ref = createRef<CaptchaHandle>();

    render(<Captcha ref={ref} mode="execute" onVerify={vi.fn()} />);

    act(() => {
      ref.current?.execute();
    });

    expect(mockExecute).not.toHaveBeenCalled();

    act(() => {
      mockTurnstileProps[0].onWidgetLoad("widget-id");
    });

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("resets execute mode before each manual execute after the widget has loaded", () => {
    const ref = createRef<CaptchaHandle>();

    render(<Captcha ref={ref} mode="execute" onVerify={vi.fn()} />);

    act(() => {
      mockTurnstileProps[0].onWidgetLoad("widget-id");
    });

    act(() => {
      ref.current?.execute();
      ref.current?.execute();
    });

    expect(mockReset).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockReset.mock.invocationCallOrder[0]).toBeLessThan(
      mockExecute.mock.invocationCallOrder[0]
    );
    expect(mockReset.mock.invocationCallOrder[1]).toBeLessThan(
      mockExecute.mock.invocationCallOrder[1]
    );
  });

  it("keeps auto mode as the default for auth forms", () => {
    render(<Captcha onVerify={vi.fn()} />);

    expect(mockTurnstileProps[0].options).toMatchObject({
      refreshExpired: "auto",
      refreshTimeout: "auto",
      retry: "auto",
      retryInterval: 2000,
      size: "invisible",
    });
    expect(mockTurnstileProps[0].options).not.toHaveProperty("appearance");
    expect(mockTurnstileProps[0].options).not.toHaveProperty("execution");
  });
});
