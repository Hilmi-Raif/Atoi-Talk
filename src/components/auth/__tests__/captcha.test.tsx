import { Captcha, type CaptchaHandle } from "@/components/auth/captcha";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockTurnstileProps.length = 0;
  });
  it("does not mount turnstile when disabled and releases auto mode once", () => {
    vi.stubEnv("VITE_CAPTCHA_ENABLED", "false");
    const onVerify = vi.fn();
    const { queryByTestId, rerender } = render(<Captcha onVerify={onVerify} />);
    expect(queryByTestId("turnstile")).toBeNull();
    expect(onVerify).toHaveBeenCalledOnce();
    rerender(<Captcha onVerify={onVerify} />);
    expect(onVerify).toHaveBeenCalledOnce();
  });
  it.each(["true", "0", "False", "", undefined])("keeps captcha enabled for flag %s", (flag) => {
    vi.stubEnv("VITE_CAPTCHA_ENABLED", flag);
    const { getByTestId } = render(<Captcha onVerify={vi.fn()} />);
    expect(getByTestId("turnstile")).toBeInTheDocument();
  });
  it("releases each execute without a widget when disabled", async () => {
    vi.stubEnv("VITE_CAPTCHA_ENABLED", "false");
    const onVerify = vi.fn();
    const ref = createRef<CaptchaHandle>();
    render(<Captcha mode="execute" ref={ref} onVerify={onVerify} />);
    expect(onVerify).not.toHaveBeenCalled();
    await act(async () => {
      ref.current?.execute();
    });
    await act(async () => {
      ref.current?.execute();
    });
    expect(onVerify).toHaveBeenCalledTimes(2);
    expect(ref.current?.getResponse()).toBeTruthy();
    expect(mockExecute).not.toHaveBeenCalled();
  });
  it("releases auto mode after a reset and cancels callbacks after unmount", async () => {
    vi.stubEnv("VITE_CAPTCHA_ENABLED", "false");
    const ref = createRef<CaptchaHandle>();
    const onVerify = vi.fn();
    const { unmount } = render(<Captcha ref={ref} onVerify={onVerify} />);
    await act(async () => {
      ref.current?.reset();
    });
    expect(onVerify).toHaveBeenCalledTimes(2);
    ref.current?.reset();
    unmount();
    await act(async () => {});
    expect(onVerify).toHaveBeenCalledTimes(2);
  });
  it("publishes verified tokens, expires them, and exposes the widget response", () => {
    const ref = createRef<CaptchaHandle>();
    const onVerify = vi.fn();
    const onExpire = vi.fn();
    render(<Captcha ref={ref} onVerify={onVerify} onExpire={onExpire} />);
    act(() => mockTurnstileProps[0].onSuccess("verified"));
    expect(mockSetCaptchaToken).toHaveBeenLastCalledWith("verified");
    expect(onVerify).toHaveBeenCalledWith("verified");
    expect(ref.current?.getResponse()).toBe("captcha-response");
    act(() => mockTurnstileProps[0].onExpire());
    expect(mockSetCaptchaToken).toHaveBeenLastCalledWith(null);
    expect(onExpire).toHaveBeenCalledOnce();
  });
  it("debounces automatic error resets and cancels a pending reset after successful verification", () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    render(<Captcha onVerify={vi.fn()} onError={onError} />);
    act(() => mockTurnstileProps[0].onError("network"));
    act(() => vi.advanceTimersByTime(1000));
    act(() => mockTurnstileProps[0].onError("again"));
    act(() => vi.advanceTimersByTime(1199));
    expect(mockReset).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(mockReset).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenNthCalledWith(2, "again");
    act(() => mockTurnstileProps[0].onError());
    act(() => mockTurnstileProps[0].onSuccess("recovered"));
    act(() => vi.advanceTimersByTime(1200));
    expect(mockReset).toHaveBeenCalledOnce();
  });
  it("manual reset cancels automatic retries and unmount clears outstanding timers", () => {
    vi.useFakeTimers();
    const ref = createRef<CaptchaHandle>();
    const { unmount } = render(<Captcha ref={ref} onVerify={vi.fn()} />);
    act(() => mockTurnstileProps[0].onError());
    act(() => ref.current?.reset());
    act(() => vi.advanceTimersByTime(1200));
    expect(mockReset).toHaveBeenCalledOnce();
    act(() => mockTurnstileProps[0].onError());
    unmount();
    act(() => vi.advanceTimersByTime(1200));
    expect(mockReset).toHaveBeenCalledOnce();
  });
  it("does not auto-retry execute-mode errors or replay a cancelled queued execution", () => {
    vi.useFakeTimers();
    const ref = createRef<CaptchaHandle>();
    render(<Captcha ref={ref} mode="execute" onVerify={vi.fn()} />);
    act(() => ref.current?.execute());
    act(() => mockTurnstileProps[0].onError());
    act(() => mockTurnstileProps[0].onExpire());
    act(() => mockTurnstileProps[0].onWidgetLoad());
    act(() => vi.advanceTimersByTime(1200));
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
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
