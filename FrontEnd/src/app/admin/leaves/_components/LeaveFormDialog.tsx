"use client";

/**
 * Admin leave create form (react-hook-form + zod) for the staff panel drawer.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateLeave } from "@/hooks/useLeaves";
import type { AdminDoctor } from "@/types/admin-doctor";

export interface AdminLeaveFormProps {
  /** Available doctors for the doctor select. */
  doctors: AdminDoctor[];
  onDone: () => void;
  onCancel: () => void;
}

interface FormValues {
  doctor_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}

const schema = z.object({
  doctor_id: z.string().min(1, "انتخاب پزشک الزامی است"),
  start_date: z.string().min(1, "تاریخ شروع الزامی است"),
  end_date: z.string().min(1, "تاریخ پایان الزامی است"),
  reason: z.string(),
});

export function AdminLeaveForm({
  doctors,
  onDone,
  onCancel,
}: AdminLeaveFormProps) {
  const createMutation = useCreateLeave();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      doctor_id: doctors[0]?.id ?? "",
      start_date: "",
      end_date: "",
      reason: "",
    },
  });

  useEffect(() => {
    form.reset({
      doctor_id: doctors[0]?.id ?? "",
      start_date: "",
      end_date: "",
      reason: "",
    });
  }, [doctors, form]);

  const isPending = createMutation.isPending;

  async function onSubmit(values: FormValues) {
    await createMutation.mutateAsync(values);
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
          name="doctor_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>پزشک</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="انتخاب پزشک" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.first_name} {d.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>از تاریخ</FormLabel>
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
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>تا تاریخ</FormLabel>
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
        </div>

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

/** @deprecated Use AdminLeaveForm */
export const LeaveFormDialog = AdminLeaveForm;
