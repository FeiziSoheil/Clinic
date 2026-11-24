"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  LogIn,
  Lock,
  Phone,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { loginStaff, otpErrorMessage, verifyOtpLogin } from "@/lib/auth";
import { loginPath, parseLoginAs, type LoginAs } from "@/lib/login-routes";
import { getRoleHomePath, resolveAuthRedirect } from "@/lib/role-redirect";
import { useAuthStore } from "@/store/authStore";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useOtpFlow } from "@/hooks/useOtpFlow";
import { toEnglishDigits, toPersianDigits } from "@/lib/utils";

import { OtpCodeInput } from "@/components/auth/OtpCodeInput";
import { LoginChooser } from "@/components/auth/LoginChooser";
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

/** OTP step within the patient flow. */
type OtpStep = "phone" | "code";

/** Minimal Axios-like error shape we read the HTTP status from. */
interface ApiErrorLike {
  response?: { status?: number };
}

function LoginFallback() {
  return (
    <Card className="w-full border-border/60 shadow-xl">
      <CardContent className="flex items-center justify-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

/**
 * Login page — patient OTP or staff credentials.
 *
 * The `as` query param determines which form is shown (`patient` | `staff`).
 * Visiting `/login` without a valid param shows the login chooser.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseLoginAs(searchParams.get("as"));

  const { isAuthorized, user, isLoading } = useRequireAuth();

  // --- Patient (OTP) state -------------------------------------------------
  const [step, setStep] = useState<OtpStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const otp = useOtpFlow();

  // --- Staff (username + password) state -----------------------------------
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthorized && user) {
      const next = searchParams.get("next");
      if (next?.startsWith("/") && !next.startsWith("//")) {
        router.replace(next);
        return;
      }
      router.replace(resolveAuthRedirect(user.role));
    }
  }, [isLoading, isAuthorized, user, router, searchParams]);

  if (!isLoading && isAuthorized && user) {
    return null;
  }

  if (!mode) {
    return <LoginChooser />;
  }

  return (
    <LoginCard
      mode={mode}
      step={step}
      phone={phone}
      setPhone={setPhone}
      code={code}
      setCode={setCode}
      phoneError={phoneError}
      setPhoneError={setPhoneError}
      verifying={verifying}
      setVerifying={setVerifying}
      otp={otp}
      username={username}
      setUsername={setUsername}
      password={password}
      setPassword={setPassword}
      staffError={staffError}
      setStaffError={setStaffError}
      staffLoading={staffLoading}
      setStaffLoading={setStaffLoading}
      setStep={setStep}
      router={router}
      searchParams={searchParams}
    />
  );
}

interface LoginCardProps {
  mode: LoginAs;
  step: OtpStep;
  phone: string;
  setPhone: (value: string) => void;
  code: string;
  setCode: (value: string) => void;
  phoneError: string | null;
  setPhoneError: (value: string | null) => void;
  verifying: boolean;
  setVerifying: (value: boolean) => void;
  otp: ReturnType<typeof useOtpFlow>;
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  staffError: string | null;
  setStaffError: (value: string | null) => void;
  staffLoading: boolean;
  setStaffLoading: (value: boolean) => void;
  setStep: (step: OtpStep) => void;
  router: ReturnType<typeof useRouter>;
  searchParams: ReturnType<typeof useSearchParams>;
}

function LoginCard({
  mode,
  step,
  phone,
  setPhone,
  code,
  setCode,
  phoneError,
  setPhoneError,
  verifying,
  setVerifying,
  otp,
  username,
  setUsername,
  password,
  setPassword,
  staffError,
  setStaffError,
  staffLoading,
  setStaffLoading,
  setStep,
  router,
  searchParams,
}: LoginCardProps) {
  const isPatient = mode === "patient";
  const otherMode: LoginAs = isPatient ? "staff" : "patient";

  function validatePhone(value: string): boolean {
    if (!value.trim()) {
      setPhoneError("شماره موبایل الزامی است");
      return false;
    }
    if (!PHONE_REGEX.test(value.trim())) {
      setPhoneError("شماره موبایل باید با 09 شروع و ۱۱ رقم باشد");
      return false;
    }
    setPhoneError(null);
    return true;
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    const normalized = phone.trim();
    if (!validatePhone(normalized)) return;

    otp.clearError();
    const ok = await otp.send(normalized);
    if (ok) {
      setPhone(normalized);
      setCode("");
      setStep("code");
      toast.success("کد تأیید ارسال شد");
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const normalized = phone.trim();
    if (code.length < 4) {
      toast.error("کد تأیید را کامل وارد کنید");
      return;
    }
    setVerifying(true);
    try {
      const response = await verifyOtpLogin({ phone: normalized, code });
      useAuthStore.getState().login(response.user, response.token);
      toast.success("ورود با موفقیت انجام شد");
      const next = searchParams.get("next");
      if (next?.startsWith("/") && !next.startsWith("//")) {
        router.replace(next);
      } else {
        router.replace(resolveAuthRedirect(response.user.role));
      }
    } catch (error) {
      toast.error(otpErrorMessage(error, "ورود ناموفق بود. دوباره تلاش کنید."));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    otp.clearError();
    const ok = await otp.resend();
    if (ok) toast.success("کد جدید ارسال شد.");
  }

  async function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setStaffError("نام کاربری و رمز عبور الزامی است");
      return;
    }
    setStaffLoading(true);
    setStaffError(null);
    try {
      const response = await loginStaff({
        username: trimmedUsername,
        password,
      });
      useAuthStore.getState().login(response.user, response.token);
      toast.success("ورود با موفقیت انجام شد");
      router.replace(getRoleHomePath(response.user.role));
    } catch (error) {
      const status = (error as ApiErrorLike)?.response?.status;
      if (status === 401) {
        setStaffError("نام کاربری یا رمز عبور نادرست است");
      } else if (status === 403) {
        setStaffError("این حساب برای ورود با نام کاربری و رمز عبور غیرفعال است");
      } else {
        setStaffError("ورود ناموفق بود. دوباره تلاش کنید.");
      }
    } finally {
      setStaffLoading(false);
    }
  }

  return (
    <Card className="w-full border-border/60 shadow-xl">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LogIn className="size-5" />
        </div>
        <CardTitle className="text-2xl">
          {isPatient ? "ورود بیمار" : "ورود پرسنل"}
        </CardTitle>
        <CardDescription>
          {isPatient
            ? "شماره موبایل خود را وارد کنید تا کد تأیید ارسال شود."
            : "با نام کاربری و رمز عبور وارد شوید."}
        </CardDescription>
      </CardHeader>

      {isPatient ? (
        step === "phone" ? (
          <form onSubmit={handleSendCode}>
            <CardContent className="space-y-4 pt-2 mb-4">
              <div className="space-y-2">
                <label htmlFor="login-phone" className="text-sm font-medium">
                  شماره موبایل
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-phone"
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="tel"
                    placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                    className="pl-9 text-left font-vazir"
                    value={toPersianDigits(phone)}
                    onChange={(e) => {
                      const en = toEnglishDigits(e.target.value).replace(/\D/g, "");
                      setPhone(en);
                      if (phoneError) validatePhone(en);
                    }}
                    onBlur={() => validatePhone(phone)}
                  />
                </div>
                {phoneError && (
                  <p className="text-sm text-destructive">{phoneError}</p>
                )}
              </div>
              {otp.error && (
                <p className="text-sm text-destructive">{otp.error}</p>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
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
                حساب کاربری ندارید؟{" "}
                <Link
                  href="/register"
                  className="font-medium text-primary hover:underline"
                >
                  ثبت‌نام کنید
                </Link>
              </p>
            </CardFooter>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <CardContent className="space-y-4 pt-2 mb-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">کد تأیید</label>
                <OtpCodeInput
                  value={code}
                  onChange={setCode}
                  disabled={verifying}
                  autoFocus
                />
              </div>

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
                    setStep("phone");
                    setCode("");
                    otp.clearError();
                  }}
                  className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowRight className="size-4" />
                  تغییر شماره
                </button>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                disabled={verifying || otp.phase === "locked"}
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    در حال ورود…
                  </>
                ) : (
                  "ورود"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                حساب کاربری ندارید؟{" "}
                <Link
                  href="/register"
                  className="font-medium text-primary hover:underline"
                >
                  ثبت‌نام کنید
                </Link>
              </p>
            </CardFooter>
          </form>
        )
      ) : (
        <form onSubmit={handleStaffLogin}>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-sm font-medium">
                نام کاربری
              </label>
              <div className="relative">
                <UserCog className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-username"
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  placeholder="username"
                  className="pl-9 text-left"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (staffError) setStaffError(null);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium">
                رمز عبور
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 text-left"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (staffError) setStaffError(null);
                  }}
                />
              </div>
            </div>

            {staffError && (
              <p className="text-sm text-destructive">{staffError}</p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-4 mt-4">
            <Button type="submit" className="w-full" disabled={staffLoading}>
              {staffLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال ورود…
                </>
              ) : (
                "ورود"
              )}
            </Button>
          </CardFooter>
        </form>
      )}

      <CardFooter className="border-t border-border/60 pt-4">
        <p className="w-full text-center text-sm text-muted-foreground">
          {isPatient ? "پرسنل هستید؟" : "بیمار هستید؟"}{" "}
          <Link
            href={loginPath(otherMode)}
            className="font-medium text-primary hover:underline"
          >
            {isPatient ? "ورود پرسنل" : "ورود بیمار"}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
