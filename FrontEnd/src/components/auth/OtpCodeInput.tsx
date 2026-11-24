"use client";

import { useEffect, useRef } from "react";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

/**
 * Length of the OTP code, mirrors the backend default (OTP_LENGTH=6).
 */
const OTP_LENGTH = 6;

interface OtpCodeInputProps {
  /** Current code value (string of digits). */
  value: string;
  /** Called whenever the code changes, with the full digit string. */
  onChange: (code: string) => void;
  /** Called once all digits are filled. */
  onComplete?: (code: string) => void;
  /** Disable all inputs (e.g. while submitting). */
  disabled?: boolean;
  /** Auto-focus the first box on mount. */
  autoFocus?: boolean;
}

/**
 * Six-box one-time-password input built on the shadcn/ui `input-otp` component.
 *
 * The component is fully controlled: the parent owns the `value` string and is
 * notified via `onChange` (on every keystroke) and `onComplete` (once the code
 * is fully filled). Accessibility is handled by the underlying `input-otp`
 * library, including `autoComplete="one-time-code"` so mobile browsers can
 * auto-fill the SMS-delivered code.
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: OtpCodeInputProps) {
  // The input-otp library only auto-focuses on the first user interaction when
  // autoFocus is set on the element; we additionally focus the container on
  // mount to mirror the previous behaviour.
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) {
      // The underlying input lives inside the container; focus it directly.
      const input = containerRef.current?.querySelector("input");
      input?.focus();
    }
  }, [autoFocus]);

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="flex w-full justify-center"
      role="group"
      aria-label="کد تأیید یکبار مصرف"
    >
      <InputOTP
        maxLength={OTP_LENGTH}
        value={value ?? ""}
        onChange={onChange}
        onComplete={onComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        pattern="^\d*$"
        autoComplete="one-time-code"
        containerClassName="justify-center"
      >
        <InputOTPGroup className="gap-2">
          {Array.from({ length: OTP_LENGTH }).map((_, index) => (
            <InputOTPSlot
              key={index}
              index={index}
              className="size-12 rounded-lg text-lg font-semibold first:rounded-l-lg last:rounded-r-lg"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
