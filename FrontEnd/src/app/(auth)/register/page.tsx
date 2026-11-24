"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  IdCard,
  KeyRound,
  Loader2,
  Lock,
  Phone,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { otpErrorMessage, verifyOtpRegister } from "@/lib/auth";
import { loginPath } from "@/lib/login-routes";
import { getRoleHomePath } from "@/lib/role-redirect";
import { useAuthStore } from "@/store/authStore";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useOtpFlow } from "@/hooks/useOtpFlow";
import { toEnglishDigits, toPersianDigits } from "@/lib/utils";

import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** Iranian mobile number pattern: starts with 09 and has 11 digits total. */
const PHONE_REGEX = /^09\d{9}$/;

type Step = "form" | "code";

/** Field values carried from the profile form into the OTP verification step. */
interface ProfileValues {
  first_name: string;
  last_name: string;
  national_code: string;
  phone: string;
}

/**
 * Registration page — OTP based.
 *
 * Patients register without a password: they fill in their profile, receive a
 * one-time code over SMS, then verify it to create the account. The flow has
 * two steps:
 *  1. Enter profile + phone → request a code (`POST /v1/auth/otp/send`).
 *  2. Enter the received code → verify & register
 *     (`POST /v1/auth/otp/register`), which sends the profile fields together
 *     with the code in a single request.
 *
 * The profile values are kept in state across the two steps so they can be
 * submitted alongside the verified code. Already-authenticated visitors are
 * bounced to their role home path.
 */
export default function RegisterPage() {
  const router = useRouter();
  const { isAuthorized, user, isLoading } = useRequireAuth();

  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<ProfileValues>({
    first_name: "",
    last_name: "",
    national_code: "",
    phone: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileValues, string>>>({});
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Owns the single OTP countdown, the resend quota and the lock state.
  const otp = useOtpFlow();

  // Redirect already-authenticated users away from the register page.
  useEffect(() => {
    if (!isLoading && isAuthorized && user) {
      router.replace(getRoleHomePath(user.role));
    }
  }, [isLoading, isAuthorized, user, router]);

  // Prevent rendering the form for already-authenticated users.
  if (!isLoading && isAuthorized && user) {
    return null;
  }

  /** Validate the whole profile form, populating `errors`. Returns success. */
  function validate(values: ProfileValues): boolean {
    const next: Partial<Record<keyof ProfileValues, string>> = {};
    if (values.first_name.trim().length < 2) {
      next.first_name = "نام باید حداقل ۲ کاراکتر باشد";
    }
    if (values.last_name.trim().length < 2) {
      next.last_name = "نام خانوادگی باید حداقل ۲ کاراکتر باشد";
    }
    if (!/^\d{10}$/.test(values.national_code.trim())) {
      next.national_code = "کد ملی باید ۱۰ رقم باشد";
    }
    if (!PHONE_REGEX.test(values.phone.trim())) {
      next.phone = "شماره موبایل باید با 09 شروع و ۱۱ رقم باشد";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function updateField(field: keyof ProfileValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  /** Step 1 submit: validate the profile, then send the OTP code. */
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const values: ProfileValues = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      national_code: form.national_code.trim(),
      phone: form.phone.trim(),
    };
    setForm(values);
    if (!validate(values)) return;

    otp.clearError();
    const ok = await otp.send(values.phone);
    if (ok) {
      setCode("");
      setStep("code");
      toast.success("کد تأیید ارسال شد");
    }
  }

  /** Step 2 submit: verify the code and create the account. */
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 4) {
      toast.error("کد تأیید را کامل وارد کنید");
      return;
    }
    setVerifying(true);
    try {
      const response = await verifyOtpRegister({
        phone: form.phone,
        code,
        first_name: form.first_name,
        last_name: form.last_name,
        national_code: form.national_code,
      });
      useAuthStore.getState().login(response.user, response.token);
      toast.success("ثبت‌نام با موفقیت انجام شد");
      router.replace(getRoleHomePath(response.user.role));
    } catch (error) {
      toast.error(otpErrorMessage(error, "ثبت‌نام ناموفق بود. دوباره تلاش کنید."));
    } finally {
      setVerifying(false);
    }
  }

  /** Request a fresh code and toast the outcome. */
  async function handleResend() {
    otp.clearError();
    const ok = await otp.resend();
    if (ok) toast.success("کد جدید ارسال شد.");
  }

  return (
    <Card className="w-full border-border/60 shadow-xl">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserPlus className="size-5" />
        </div>
        <CardTitle className="text-2xl">ایجاد حساب کاربری</CardTitle>
        <CardDescription>
          {step === "form"
            ? "برای ساخت حساب جدید، اطلاعات خود را وارد کنید."
            : `کد تأیید ارسال شده به ${form.phone} را وارد کنید.`}
        </CardDescription>
      </CardHeader>

      {step === "form" ? (
        <form onSubmit={handleSendCode}>
          <CardContent className="space-y-4">
            <ProfileField
              label="نام"
              icon={<User className="size-4" />}
              autoComplete="given-name"
              placeholder="مثلاً: علی"
              value={form.first_name}
              error={errors.first_name}
              onChange={(v) => updateField("first_name", v)}
            />
            <ProfileField
              label="نام خانوادگی"
              icon={<User className="size-4" />}
              autoComplete="family-name"
              placeholder="مثلاً: رضایی"
              value={form.last_name}
              error={errors.last_name}
              onChange={(v) => updateField("last_name", v)}
            />
            <ProfileField
              label="کد ملی"
              icon={<IdCard className="size-4" />}
              autoComplete="off"
              placeholder="۰۰۱۲۳۴۵۶۷۸۹"
              inputMode="numeric"
              dir="ltr"
              persianDigits
              value={form.national_code}
              error={errors.national_code}
              onChange={(v) => updateField("national_code", v)}
            />
            <ProfileField
              label="شماره موبایل"
              icon={<Phone className="size-4" />}
              autoComplete="tel"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              inputMode="numeric"
              type="tel"
              dir="ltr"
              persianDigits
              value={form.phone}
              error={errors.phone}
              onChange={(v) => updateField("phone", v)}
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-4 mt-6">
            <Button type="submit" className="w-full" disabled={otp.sending}>
              {otp.sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال ارسال کد…
                </>
              ) : (
                "ارسال کد تأیید"
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              حساب کاربری دارید؟{" "}
              <Link
                href={loginPath("patient")}
                className="font-medium text-primary hover:underline"
              >
                وارد شوید
              </Link>
            </p>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">کد تأیید</label>
              <OtpCodeInput
                value={code}
                onChange={setCode}
                disabled={verifying}
                autoFocus
              />
            </div>

            {/* Single source of truth for the OTP status — fixed height avoids layout shift. */}
            <div className="flex min-h-[5.5rem] items-center justify-center rounded-lg bg-muted/40 px-4 py-3 text-center text-sm">
              {otp.phase === "counting" && (
                <p className="text-muted-foreground">
                  کد ارسال‌شده تا{" "}
                  <span
                    dir="ltr"
                    className="font-mono font-semibold tabular-nums text-foreground"
                  >
                    {otp.formatted}
                  </span>{" "}
                  معتبر است.
                </p>
              )}

              {otp.phase === "expired" && (
                <div className="space-y-1.5">
                  <p className="text-foreground">کد منقضی شد.</p>
                  <button
                    type="button"
                    disabled={otp.sending}
                    onClick={handleResend}
                    className="inline-flex items-center gap-1 font-medium text-primary transition-colors hover:underline disabled:opacity-60"
                  >
                    {otp.sending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    ارسال مجدد کد
                  </button>
                  {otp.maxResends > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {toPersianDigits(`${otp.remainingResends}`)} بار دیگر
                      امکان ارسال مجدد دارید.
                    </p>
                  )}
                </div>
              )}

              {otp.phase === "locked" && (
                <p className="text-destructive">
                  به دلیل درخواست‌های مکرر، ارسال کد تا{" "}
                  <span
                    dir="ltr"
                    className="font-mono font-semibold tabular-nums"
                  >
                    {otp.formatted}
                  </span>{" "}
                  غیرفعال شده است.
                </p>
              )}
            </div>

            {otp.error && (
              <p className="text-center text-sm text-destructive">{otp.error}</p>
            )}

            <div className="flex justify-start text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("form");
                  setCode("");
                  otp.clearError();
                }}
                className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowRight className="size-4" />
                ویرایش اطلاعات
              </button>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4 mt-6">
            <Button
              type="submit"
              className="w-full"
              disabled={verifying || otp.phase === "locked"}
            >
              {verifying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال ثبت‌نام…
                </>
              ) : (
                "تأیید و ثبت‌نام"
              )}
            </Button>

            <p className="inline-flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              با تأیید کد، حساب شما ایجاد می‌شود.
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

interface ProfileFieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "text";
  dir?: "ltr" | "rtl";
  autoComplete?: string;
  placeholder?: string;
  /** Display digits in Persian (۰-۹); the stored value stays ASCII digits. */
  persianDigits?: boolean;
}

/** A labelled text field with a leading icon and inline error message. */
function ProfileField({
  label,
  icon,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  dir,
  autoComplete,
  placeholder,
  persianDigits,
}: ProfileFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        <Input
          type={type}
          inputMode={inputMode}
          dir={dir}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`pl-9 font-vazir ${dir === "ltr" ? "text-left" : ""}`}
          value={persianDigits ? toPersianDigits(value) : value}
          onChange={(e) =>
            onChange(
              persianDigits
                ? toEnglishDigits(e.target.value).replace(/\D/g, "")
                : e.target.value,
            )
          }
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

