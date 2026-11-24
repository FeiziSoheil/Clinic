"use client";

/**
 * Create shift dialog (react-hook-form + zod).
 *
 * Lets the doctor create either a single shift or a recurring set of shifts
 * across a weekday range. Drives the shadcn `Form` wrapper, validates with a
 * zod schema, and calls the create mutations from
 * [`useDoctorShifts.ts`](src/hooks/useDoctorShifts.ts). On success it toasts
 * (handled in the mutation) and closes the dialog.
 *
 * The backend `date`/`start_time`/`end_time` are Go `time.Time`; the API layer
 * combines the form's `"YYYY-MM-DD"` + `"HH:mm"` values into ISO datetimes.
 *
 * Cross-field / conditional validation (end>start, recurring fields) is applied
 * via zod's `superRefine` so the errors surface next to the relevant fields.
 */

import { useEffect, useMemo, type ComponentProps } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch, type ControllerRenderProps } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { toPersianDigits } from "@/lib/jalali";
import {
  useCreateRecurringShifts,
  useCreateShift,
} from "@/hooks/useDoctorShifts";
import { cn } from "@/lib/utils";

export interface ShiftFormProps {
  /** Hex id of the signed-in doctor. */
  doctorId: string;
  onDone: () => void;
  onCancel: () => void;
}

/** Weekday options (Go `time.Weekday` order) with Persian labels. */
const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
  { value: "SUNDAY", label: "یکشنبه" },
  { value: "MONDAY", label: "دوشنبه" },
  { value: "TUESDAY", label: "سه‌شنبه" },
  { value: "WEDNESDAY", label: "چهارشنبه" },
  { value: "THURSDAY", label: "پنجشنبه" },
  { value: "FRIDAY", label: "جمعه" },
  { value: "SATURDAY", label: "شنبه" },
];

/** Maps a `"SUNDAY"`-style weekday name to its JS `Date.getDay()` index (0=Sun). */
const WEEKDAY_TO_JS: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/**
 * Count the number of shifts a recurring request would create: the number of
 * days inside the inclusive `[from, to]` window whose weekday matches one of the
 * selected `weekdays`. Returns `0` for incomplete or invalid input.
 */
function countRecurringShifts(
  weekdays: string[],
  from: string,
  to: string,
): number {
  if (!weekdays.length || !from || !to || from > to) return 0;
  const targets = new Set(weekdays.map((d) => WEEKDAY_TO_JS[d]));
  if (!targets.size) return 0;

  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (targets.has(cursor.getUTCDay())) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Zod schema for the form (input == output so the resolver types line up). */
const schema = z
  .object({
    date: z.string(),
    start_time: z.string().min(1, "ساعت شروع الزامی است"),
    end_time: z.string().min(1, "ساعت پایان الزامی است"),
    max_patients: z
      .string()
      .min(1, "حداکثر بیمار الزامی است")
      .refine((v) => Number(v) >= 1, "حداقل ۱ بیمار"),
    recurring: z.boolean(),
    weekdays: z.array(z.string()),
    from_date: z.string(),
    to_date: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.start_time >= data.end_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: "ساعت پایان باید بعد از شروع باشد",
      });
    }
    if (data.recurring) {
      if (data.weekdays.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["weekdays"],
          message: "حداقل یک روز انتخاب کنید",
        });
      }
      if (!data.from_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from_date"],
          message: "تاریخ شروع بازه الزامی است",
        });
      }
      if (!data.to_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to_date"],
          message: "تاریخ پایان بازه الزامی است",
        });
      }
      if (
        data.from_date &&
        data.to_date &&
        data.from_date > data.to_date
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to_date"],
          message: "تاریخ پایان باید بعد از تاریخ شروع باشد",
        });
      }
    } else if (!data.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message: "تاریخ الزامی است",
      });
    }
  });

/** Form-values type derived from the schema. */
type FormValues = z.infer<typeof schema>;

/**
 * Bridge between react-hook-form's controller field and the Base UI
 * (Field-aware) {@link Input}.
 *
 * Base UI's `Input` is a `Field.Control`: it does not reliably propagate the
 * native `onChange` event back to react-hook-form when we simply spread
 * `{...field}`. The value therefore never lands in the form state, which is why
 * the shift form silently failed validation on the (empty-default) `date`
 * field. Binding Base UI's canonical `onValueChange(value)` to
 * `field.onChange(value)` (and `value` to `field.value`) fixes the sync.
 */
function FieldInput({
  field,
  type,
  ...rest
}: {
  field: ControllerRenderProps<FormValues, keyof FormValues>;
  type: ComponentProps<"input">["type"];
} & Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange" | "onValueChange" | "name" | "ref" | "onBlur"
>) {
  return (
    <Input
      {...({
        type,
        value: (field.value as string) ?? "",
        name: field.name,
        ref: field.ref,
        onBlur: field.onBlur,
        onValueChange: (v: string) => field.onChange(v),
        ...rest,
      } as ComponentProps<typeof Input>)}
    />
  );
}

export function ShiftForm({
  doctorId,
  onDone,
  onCancel,
}: ShiftFormProps) {
  const createMutation = useCreateShift();
  const createRecurringMutation = useCreateRecurringShifts();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: "",
      start_time: "09:00",
      end_time: "13:00",
      max_patients: "10",
      recurring: false,
      weekdays: [],
      from_date: "",
      to_date: "",
    },
  });

  // Re-seed defaults on mount (drawer remounts content when opened).
  useEffect(() => {
    form.reset({
      date: "",
      start_time: "09:00",
      end_time: "13:00",
      max_patients: "10",
      recurring: false,
      weekdays: [],
      from_date: "",
      to_date: "",
    });
  }, [form]);

  const recurring = useWatch({ control: form.control, name: "recurring" });
  const watchedWeekdays = useWatch({ control: form.control, name: "weekdays" });
  const watchedFromDate = useWatch({ control: form.control, name: "from_date" });
  const watchedToDate = useWatch({ control: form.control, name: "to_date" });
  const isPending =
    createMutation.isPending || createRecurringMutation.isPending;

  /**
   * Preview: how many individual shifts the recurring request will create —
   * the count of days inside `[from_date, to_date]` whose weekday matches one of
   * the selected `weekdays`. Zero when inputs are incomplete or invalid.
   */
  const recurringPreviewCount = useMemo(() => {
    if (!recurring) return 0;
    return countRecurringShifts(
      watchedWeekdays ?? [],
      watchedFromDate ?? "",
      watchedToDate ?? "",
    );
  }, [recurring, watchedWeekdays, watchedFromDate, watchedToDate]);

  /** Persian labels of the currently-selected weekdays, joined by "، ". */
  const selectedWeekdayLabels = useMemo(
    () =>
      (watchedWeekdays ?? [])
        .map(
          (v) => WEEKDAY_OPTIONS.find((o) => o.value === v)?.label ?? v,
        )
        .join("، "),
    [watchedWeekdays],
  );

  async function onSubmit(values: FormValues) {
    const maxPatients = Number(values.max_patients);
    try {
      if (values.recurring) {
        await createRecurringMutation.mutateAsync({
          doctor_id: doctorId,
          weekdays: values.weekdays,
          start_time: values.start_time,
          end_time: values.end_time,
          max_patients: maxPatients,
          from_date: values.from_date,
          to_date: values.to_date,
        });
      } else {
        await createMutation.mutateAsync({
          doctor_id: doctorId,
          date: values.date,
          start_time: values.start_time,
          end_time: values.end_time,
          max_patients: maxPatients,
        });
      }
      onDone();
    } catch {
      // Mutation onError already shows a toast; swallow so RHF doesn't surface
      // an unhandledRejection (e.g. 409 overlapping shift).
    }
  }

  return (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ساعت شروع</FormLabel>
                    <FormControl>
                      <FieldInput field={field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ساعت پایان</FormLabel>
                    <FormControl>
                      <FieldInput field={field} type="time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="max_patients"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>حداکثر بیمار</FormLabel>
                  <FormControl>
                    <FieldInput field={field} type="number" min={1} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recurring"
              render={({ field }) => (
                <FormItem className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1 leading-none">
                      <FormLabel>شیفت تکرارشونده</FormLabel>
                      <FormDescription>
                        برای ساخت شیفت در چند هفته و چند روز فعال کنید.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Button
                        type="button"
                        variant={field.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => field.onChange(!field.value)}
                      >
                        {field.value ? "فعال" : "غیرفعال"}
                      </Button>
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            {recurring ? (
              <>
                <FormField
                  control={form.control}
                  name="weekdays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>روزهای هفته</FormLabel>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {WEEKDAY_OPTIONS.map((day) => {
                          const checked = field.value?.includes(day.value);
                          return (
                            <Button
                              key={day.value}
                              type="button"
                              variant={checked ? "default" : "outline"}
                              className={cn("justify-start")}
                              onClick={() => {
                                const next = checked
                                  ? (field.value ?? []).filter(
                                      (d) => d !== day.value,
                                    )
                                  : [...(field.value ?? []), day.value];
                                field.onChange(next);
                              }}
                            >
                              {day.label}
                            </Button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="from_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>از تاریخ</FormLabel>
                        <FormControl>
                          <JalaliDatePicker
                            value={field.value as string}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="to_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تا تاریخ</FormLabel>
                        <FormControl>
                          <JalaliDatePicker
                            value={field.value as string}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Preview: how many shifts will be created + which weekdays */}
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  {recurringPreviewCount > 0 ? (
                    <p className="text-muted-foreground">
                      با این تنظیمات{" "}
                      <span className="font-semibold text-foreground">
                        {toPersianDigits(recurringPreviewCount)}
                      </span>{" "}
                      شیفت ساخته می‌شود.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      روزهای هفته و بازهٔ تاریخ را انتخاب کنید تا تعداد شیفت‌های
                      ساخته‌شده نمایش داده شود.
                    </p>
                  )}
                  {selectedWeekdayLabels ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      روزهای انتخابی: {selectedWeekdayLabels}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>تاریخ</FormLabel>
                    <FormControl>
                      <JalaliDatePicker
                        value={field.value as string}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isPending}
              >
                انصراف
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="size-4 animate-spin" />}
                ثبت شیفت
              </Button>
            </div>
          </form>
        </Form>
  );
}

/** @deprecated Use ShiftForm */
export const ShiftFormDialog = ShiftForm;
