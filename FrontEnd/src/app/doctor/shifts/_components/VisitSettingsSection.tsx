"use client";

/**
 * Visit pricing settings section for the combined schedule/settings page.
 *
 * Backed by GET/PUT `/v1/doctor/profile` via useDoctorSettings hooks.
 */

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDoctorSettings, useUpdateDoctorSettings } from "@/hooks/useDoctorPortal";

const settingsSchema = z.object({
  visit_fee: z.coerce
    .number({ message: "باید عدد باشد" })
    .int()
    .min(1, "هزینهٔ ویزیت باید بزرگ‌تر از صفر باشد"),
  visit_duration_minutes: z.coerce
    .number({ message: "باید عدد باشد" })
    .int()
    .min(1, "حداقل ۱ دقیقه باید باشد"),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export function VisitSettingsSection() {
  const { data, isLoading, isError, error } = useDoctorSettings();
  const updateMutation = useUpdateDoctorSettings();

  const form = useForm<SettingsValues>({
    // The resolver's inferred type diverges from SettingsValues due to z.coerce;
    // the runtime payload is compatible, so cast like the admin doctor form does.
    resolver: zodResolver(settingsSchema) as never,
    defaultValues: {
      visit_fee: 0,
      visit_duration_minutes: 15,
    },
  });

  useEffect(() => {
    if (data) {
      form.reset({
        visit_fee: data.visit_fee ?? 0,
        visit_duration_minutes: data.visit_duration_minutes || 15,
      });
    }
  }, [data, form]);

  async function onSubmit(values: SettingsValues) {
    await updateMutation.mutateAsync(values);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          بارگذاری تنظیمات ناموفق بود:{" "}
          {error instanceof Error ? error.message : "خطای ناشناخته"}
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              بارگذاری تنظیمات ممکن نشد.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>تنظیمات ویزیت</CardTitle>
          <CardDescription>
            هزینهٔ ویزیت و مدت‌زمان پیش‌فرض هر ویزیت. این مبلغ از بیماران برای هر
            نوبت دریافت می‌شود.
          </CardDescription>
        </div>
        <Button
          type="submit"
          form="doctor-settings-form"
          size="sm"
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          ذخیره
        </Button>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            id="doctor-settings-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="visit_fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>هزینهٔ ویزیت (تومان)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    مبلغ به تومان. سپردهٔ اولیه نیمی از این مبلغ خواهد بود.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visit_duration_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>مدت ویزیت (دقیقه)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>
                    مدت‌زمان پیش‌فرض هر بازدید.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
