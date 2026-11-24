"use client";

/**
 * Create / edit dialog for a receptionist (منشی) scoped to a doctor.
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
  useCreateAdminReceptionist,
  useUpdateAdminReceptionist,
} from "@/hooks/useAdminRoster";
import type { AdminReceptionist } from "@/types/admin-roster";

/**
 * Single schema for create + edit. Password is always a string in the form;
 * create requires min 6 chars, edit allows empty (keep existing hash).
 */
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
  username: z
    .string()
    .min(3, "نام کاربری باید حداقل ۳ کاراکتر باشد")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد",
    ),
  password: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function ReceptionistForm({
  doctorUserId,
  receptionist,
  onDone,
  onCancel,
}: {
  doctorUserId: string | undefined;
  receptionist: AdminReceptionist | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(receptionist);
  const createMutation = useCreateAdminReceptionist(doctorUserId);
  const updateMutation = useUpdateAdminReceptionist(doctorUserId);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      national_code: "",
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    form.reset(
      receptionist
        ? {
            first_name: receptionist.first_name,
            last_name: receptionist.last_name,
            phone: receptionist.phone,
            national_code: receptionist.national_code,
            username: receptionist.username ?? "",
            password: "",
          }
        : {
            first_name: "",
            last_name: "",
            phone: "",
            national_code: "",
            username: "",
            password: "",
          },
    );
  }, [receptionist, form]);

  async function onSubmit(values: FormValues) {
    if (!doctorUserId) return;

    if (!isEdit && values.password.length < 6) {
      form.setError("password", {
        message: "رمز عبور حداقل ۶ کاراکتر باشد",
      });
      return;
    }
    if (isEdit && values.password && values.password.length < 6) {
      form.setError("password", {
        message: "رمز عبور حداقل ۶ کاراکتر باشد",
      });
      return;
    }

    if (isEdit && receptionist) {
      const { password, ...rest } = values;
      await updateMutation.mutateAsync({
        receptionistId: receptionist.id,
        req: {
          ...rest,
          ...(password ? { password } : {}),
        },
      });
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
                    <Input
                      {...field}
                      dir="ltr"
                      inputMode="tel"
                      placeholder="09123456789"
                    />
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
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نام کاربری</FormLabel>
                  <FormControl>
                    <Input {...field} dir="ltr" autoComplete="username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isEdit ? "رمز عبور جدید (اختیاری)" : "رمز عبور"}
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="password"
                      dir="ltr"
                      autoComplete="new-password"
                    />
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

/** @deprecated Use ReceptionistForm */
export const ReceptionistFormDialog = ReceptionistForm;
