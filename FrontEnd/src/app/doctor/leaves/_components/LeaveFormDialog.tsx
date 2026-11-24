"use client";

/**
 * Doctor leave create form (react-hook-form + zod).
 *
 * Scoped to the signed-in doctor — the doctor id is passed in and sent as
 * `doctor_id` on submit. Opened via the staff panel drawer.
 */

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useCreateLeave } from "@/hooks/useLeaves";

export interface LeaveFormProps {
  /** Hex id of the signed-in doctor. */
  doctorId: string;
  onDone: () => void;
  onCancel: () => void;
}

interface FormValues {
  date: string;
  reason: string;
}

const schema = z.object({
  date: z.string().min(1, "تاریخ الزامی است"),
  reason: z.string(),
});

export function LeaveForm({ doctorId, onDone, onCancel }: LeaveFormProps) {
  const createMutation = useCreateLeave();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: "",
      reason: "",
    },
  });

  useEffect(() => {
    form.reset({ date: "", reason: "" });
  }, [form]);

  const isPending = createMutation.isPending;

  async function onSubmit(values: FormValues) {
    await createMutation.mutateAsync({
      doctor_id: doctorId,
      start_date: values.date,
      end_date: values.date,
      reason: values.reason,
    });
    onDone();
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>تاریخ</FormLabel>
              <FormControl>
                <JalaliDatePicker
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>دلیل (اختیاری)</FormLabel>
              <FormControl>
                <Input placeholder="مثلاً: مرخصی استحقاقی" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
            ثبت مرخصی
          </Button>
        </div>
      </form>
    </Form>
  );
}
