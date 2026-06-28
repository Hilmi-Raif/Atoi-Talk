import { useAuthStore } from "@/store";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface CaptchaProps {
  onVerify: (token: string) => void;
  onError?: (error?: unknown) => void;
  onExpire?: () => void;
  action?: string;
  mode?: "auto" | "execute";
}

export interface CaptchaHandle {
  reset: () => void;
  execute: () => void;
  getResponse: () => string | undefined;
}

export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(
  ({ onVerify, onError, onExpire, action, mode = "auto" }, ref) => {
    const turnstileRef = useRef<TurnstileInstance>(null);
    const existingToken = useAuthStore((s) => s.captchaToken);
    const setCaptchaToken = useAuthStore((s) => s.setCaptchaToken);
    const hasRestoredRef = useRef(false);
    const retryResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isWidgetReadyRef = useRef(false);
    const pendingExecuteRef = useRef(false);

    const clearRetryResetTimer = () => {
      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }
    };

    const scheduleWidgetReset = () => {
      clearRetryResetTimer();
      retryResetTimerRef.current = setTimeout(() => {
        turnstileRef.current?.reset();
        retryResetTimerRef.current = null;
      }, 1200);
    };

    useImperativeHandle(ref, () => ({
      reset: () => {
        clearRetryResetTimer();
        setCaptchaToken(null);
        turnstileRef.current?.reset();
      },
      execute: () => {
        clearRetryResetTimer();
        setCaptchaToken(null);
        if (mode === "execute" && !isWidgetReadyRef.current) {
          pendingExecuteRef.current = true;
          return;
        }
        turnstileRef.current?.execute();
      },
      getResponse: () => turnstileRef.current?.getResponse(),
    }));

    useEffect(() => {
      if (existingToken && !hasRestoredRef.current) {
        hasRestoredRef.current = true;
        onVerify(existingToken);
      }
    }, [existingToken, onVerify]);

    useEffect(() => {
      return () => {
        clearRetryResetTimer();
      };
    }, []);

    const handleVerify = (token: string) => {
      clearRetryResetTimer();
      setCaptchaToken(token);
      onVerify(token);
    };

    const handleError = (error?: unknown) => {
      setCaptchaToken(null);
      pendingExecuteRef.current = false;
      if (mode === "auto") {
        scheduleWidgetReset();
      }
      onError?.(error);
    };

    const handleExpire = () => {
      setCaptchaToken(null);
      onExpire?.();
    };

    const handleWidgetLoad = () => {
      isWidgetReadyRef.current = true;
      if (mode === "execute" && pendingExecuteRef.current) {
        pendingExecuteRef.current = false;
        turnstileRef.current?.execute();
      }
    };

    return (
      <div
        className={
          mode === "execute"
            ? "fixed bottom-4 right-4 z-50 pointer-events-auto"
            : "fixed -z-50 top-0 left-0 opacity-0 pointer-events-none"
        }
      >
        <Turnstile
          ref={turnstileRef}
          siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
          onWidgetLoad={handleWidgetLoad}
          onSuccess={handleVerify}
          onError={handleError}
          onExpire={handleExpire}
          options={{
            action,
            size: "invisible",
            retry: "auto",
            retryInterval: mode === "execute" ? 8000 : 2000,
            refreshExpired: mode === "execute" ? "manual" : "auto",
            refreshTimeout: mode === "execute" ? "manual" : "auto",
            ...(mode === "execute" ? { appearance: "execute", execution: "execute" } : {}),
          }}
        />
      </div>
    );
  }
);

Captcha.displayName = "Captcha";
