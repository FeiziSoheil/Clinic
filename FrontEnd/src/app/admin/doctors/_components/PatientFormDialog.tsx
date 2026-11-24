"use client";

/**
 * Create / edit dialog for a patient assigned to a doctor (admin roster).
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
import {
  useCreateAdminPatient,
  useUpdateAdminPatient,
} from "@/hooks/useAdminRoster";
import type { AdminPatient } from "@/types/admin-roster";

const schema = z.object({
  first_name: z.string().min(1, "نام الزامی است"),
  last_name: z.string().min(1, "نام خانوادگی الزامی است"),
  phone: z
    .string()
    .min(1, "شماره موبایل الزامی است")
    .regex(/^0\d{10}$/, "شماره موبایل معتبر نیست (۱۱ رقم، با ۰ شروع شود)"),
  national_code: z
    .string()
    .min(1, "کد ملی الزامی است")
    .regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد"),
});

type FormValues = z.infer<typeof schema>;

export function PatientForm({
  doctorUserId,
  patient,
  onDone,
  onCancel,
}: {
  doctorUserId: string | undefined;
  patient: AdminPatient | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(patient);
  const createMutation = useCreateAdminPatient(doctorUserId);
  const updateMutation = useUpdateAdminPatient(doctorUserId);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      national_code: "",
    },
  });

  useEffect(() => {
    form.reset(
      patient
        ? {
            first_name: patient.first_name,
            last_name: patient.last_name,
            phone: patient.phone,
            national_code: patient.national_code,
          }
        : {
            first_name: "",
            last_name: "",
            phone: "",
            national_code: "",
          },
    );
  }, [patient, form]);

  async function onSubmit(values: FormValues) {
    if (!doctorUserId) return;
    if (isEdit && patient) {
      await updateMutation.mutateAsync({ patientId: patient.id, req: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    onDone();
  }

  return (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نام</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="given-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نام خانوادگی</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="family-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>شماره موبایل</FormLabel>
                  <FormControl>
                    <Input {...field} dir="ltr" inputMode="tel" placeholder="09123456789" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="national_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>کد ملی</FormLabel>
                  <FormControl>
                    <Input {...field} dir="ltr" inputMode="numeric" />
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
              <Button type="submit" disabled={isPending || !doctorUserId}>
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {isEdit ? "ذخیرهٔ تغییرات" : "افزودن"}
              </Button>
            </div>
          </form>
        </Form>
  );
}

/** @deprecated Use PatientForm */
export const PatientFormDialog = PatientForm;
