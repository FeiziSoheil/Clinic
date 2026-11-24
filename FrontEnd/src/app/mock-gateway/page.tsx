"use client";

/**
 * Mock bank payment gateway.
 *
 * Route: `/mock-gateway?code=<tracking_code>` (lives at the app root, NOT inside
 * the `(patient)` group, so the URL is exactly `/mock-gateway`).
 *
 * This is a fake gateway used to simulate the bank-redirect step of a top-up.
 * The "Simulate Bank Success" button calls the REAL verify endpoint
 * (`GET /v1/finance/mock-verify`) — the JWT is supplied automatically by the
 * Axios interceptor from the auth store.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, ShieldCheck, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useVerifyMockPayment } from "@/hooks/useFinance";

function GatewayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const verifyPayment = useVerifyMockPayment();
  const isPending = verifyPayment.isPending;

  /** Missing/empty tracking code — render an invalid-session state. */
  if (!code) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">نشست پرداخت نامعتبر است</CardTitle>
          <CardDescription>
            هیچ کد رهگیری پرداختی ارسال نشده است.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Lock className="size-10 text-muted-foreground" />
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="outline" onClick={() => router.push("/wallet")}>
            <ArrowLeft className="size-4" />
            بازگشت به کیف پول
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // After the guard above, `code` is a non-empty string. Capture it so the
  // closures below keep the narrowed type.
  const trackingCode: string = code;

  async function handleSuccess() {
    try {
      await verifyPayment.mutateAsync(trackingCode);
      toast.success("پرداخت موفق بود! کیف پول شارژ شد.");
      router.replace("/wallet");
    } catch (err) {
      toast.error("تأیید پرداخت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    }
  }

  function handleFailure() {
    toast.error("پرداخت ناموفق بود.");
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <ShieldCheck className="size-12 text-primary" />
        <CardTitle className="text-xl">درگاه پرداخت امن</CardTitle>
        <CardDescription>
          پرداخت خود را تأیید کنید تا کیف پول شارژ شود.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-muted-foreground">کد رهگیری</span>
          <span className="font-mono font-medium">{code}</span>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          درگاه نمایشی — نیاز به اطلاعات واقعی کارت نیست.
        </p>
      </CardContent>

      <CardFooter className="flex-col gap-2">
        <Button
          className="w-full"
          onClick={handleSuccess}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {isPending ? "در حال پردازش..." : "شبیه‌سازی پرداخت موفق"}
        </Button>
        <Button
          className="w-full"
          variant="outline"
          onClick={handleFailure}
          disabled={isPending}
        >
          شبیه‌سازی پرداخت ناموفق
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function MockGatewayPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      {/* useSearchParams() must be wrapped in Suspense for static rendering. */}
      <Suspense fallback={<Loader2 className="size-6 animate-spin" />}>
        <GatewayContent />
      </Suspense>
    </div>
  );
}
