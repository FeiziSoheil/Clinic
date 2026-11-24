"use client";

/**
 * Create / Edit doctor dialog (react-hook-form + zod).
 *
 * Drives the shadcn `Form` wrapper, validates with a zod schema, and calls the
 * create/update mutations from [`useAdminDoctors.ts`](src/hooks/useAdminDoctors.ts).
 * On success it toasts (handled in the mutation) and closes the dialog.
 *
 * The `password` field is rendered only when creating a new doctor.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDoctor, useUpdateDoctor } from "@/hooks/useAdminDoctors";
import type { AdminDoctor, DoctorStatus } from "@/types/admin-doctor";

export interface DoctorFormProps {
  /** When set, the form operates in "edit" mode for this doctor. */
  doctor?: AdminDoctor | null;
  /** Available specialties for the specialty select. */
  specialties: string[];
  onDone: () => void;
  onCancel: () => void;
}

const STATUS_OPTIONS: { value: DoctorStatus; label: string }[] = [
  { value: "ACTIVE", label: "فعال" },
  { value: "INACTIVE", label: "غیرفعال" },
];

/** Shared base schema used by both create and edit. */
const baseSchema = {
  first_name: z.string().min(1, "نام الزامی است"),
  last_name: z.string().min(1, "نام خانوادگی الزامی است"),
  phone: z
    .string()
    .min(6, "شماره تلفن الزامی است")
    .regex(/^[+]?[\d\s-]+$/, "شماره تلفن معتبر وارد کنید"),
  email: z
    .string()
    .email("ایمیل معتبر وارد کنید")
    .optional()
    .or(z.literal("")),
  specialty: z.string().min(1, "تخصص الزامی است"),
  medical_system_number: z
    .string()
    .min(1, "شماره نظام پزشکی الزامی است"),
  visit_duration_minutes: z.coerce
    .number({ message: "باید عدد باشد" })
    .int()
    .min(1, "حداقل ۱ دقیقه باید باشد"),
  visit_fee: z.coerce
    .number({ message: "باید عدد باشد" })
    .int()
    .min(1, "هزینهٔ ویزیت باید بزرگ‌تر از صفر باشد"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
};

/**
 * Single form-values type. `password` is optional — it is only validated on
 * create. Using one type keeps the generic nesting shallow enough for the TS
 * parser and avoids the create/edit resolver type mismatch.
 */
interface FormValues {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  specialty: string;
  medical_system_number: string;
  national_code: string;
  /** Staff login identifier (create-only). */
  username?: string;
  visit_duration_minutes: number;
  visit_fee: number;
  status: DoctorStatus;
  password?: string;
}

const createSchema = z.object({
  ...baseSchema,
  // National code is required by the backend when minting the DOCTOR user
  // account (POST /v1/admin/users). It is create-only: there is no admin
  // user-update endpoint, so it cannot be edited afterwards.
  national_code: z.string().min(1, "کد ملی الزامی است"),
  // Username is the staff login identifier (create-only, like national_code).
  username: z
    .string()
    .min(3, "نام کاربری باید حداقل ۳ کاراکتر باشد")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد",
    ),
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
});
const updateSchema = z.object(baseSchema);

export function DoctorForm({
  doctor,
  specialties,
  onDone,
  onCancel,
}: DoctorFormProps) {
  const isEdit = Boolean(doctor);
  const createMutation = useCreateDoctor();
  const updateMutation = useUpdateDoctor();

  const form = useForm<FormValues>({
    // The resolver type differs between create/edit, but the runtime payload is
    // compatible; cast to satisfy TS without weakening the field validation.
    resolver: zodResolver(isEdit ? updateSchema : createSchema) as never,
    defaultValues: {
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      specialty: "",
      medical_system_number: "",
      national_code: "",
      username: "",
      visit_duration_minutes: 15,
      visit_fee: 100000,
      status: "ACTIVE",
      password: "",
    },
  });

  // Re-seed defaults when the target doctor changes (fresh mount on drawer open).
  useEffect(() => {
    form.reset(
      doctor
        ? {
            first_name: doctor.first_name,
            last_name: doctor.last_name,
            phone: doctor.phone,
            email: doctor.email ?? "",
            specialty: doctor.specialty,
            medical_system_number: doctor.medical_system_number,
            national_code: "",
            visit_duration_minutes: doctor.visit_duration_minutes,
            visit_fee: doctor.visit_fee ?? 0,
            status: doctor.status,
            password: "",
          }
        : {
            first_name: "",
            last_name: "",
            phone: "",
            email: "",
            specialty: "",
            medical_system_number: "",
            national_code: "",
            username: "",
            visit_duration_minutes: 15,
            visit_fee: 100000,
            status: "ACTIVE",
            password: "",
          },
    );
  }, [doctor, form]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  async function onSubmit(values: FormValues) {
    if (isEdit && doctor) {
      // national_code is create-only (no user-update endpoint) and password is
      // never edited here, so strip both before sending the profile update.
      const { password: _password, national_code: _nationalCode, ...rest } =
        values;
      void _password;
      void _nationalCode;
      await updateMutation.mutateAsync({ id: doctor.id, req: rest });
    } else {
      await createMutation.mutateAsync({
        ...values,
        username: values.username ?? "",
        password: values.password ?? "",
      });
    }
    onDone();
  }

  return (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نام</FormLabel>
                  <FormControl>
                    <Input placeholder="مثلاً: سارا" {...field} />
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
                    <Input placeholder="مثلاً: احمدی" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>تلفن</FormLabel>
                  <FormControl>
                    <Input placeholder="+98912..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ایمیل (اختیاری)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="doctor@clinick.test"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit && (
              <FormField
                control={form.control}
                name="national_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>کد ملی</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="کد ملی پزشک"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="specialty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>تخصص</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="انتخاب تخصص" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {specialties.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="medical_system_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>شماره نظام پزشکی</FormLabel>
                  <FormControl>
                    <Input placeholder="MSN-12345" {...field} />
                  </FormControl>
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
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>وضعیت</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="انتخاب وضعیت" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEdit && (
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نام کاربری</FormLabel>
                    <FormControl>
                      <Input
                        dir="ltr"
                        autoComplete="username"
                        placeholder="مثلاً: s.ahmadi"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isEdit && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>رمز عبور</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="حداقل ۶ کاراکتر"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isEdit && (
              <FormField
                control={form.control}
                name="national_code"
                render={() => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>کد ملی (غیرقابل ویرایش)</FormLabel>
                    <FormControl>
                      <Input
                        disabled
                        placeholder="کد ملی هنگام ایجاد ثبت می‌شود و قابل تغییر نیست"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="mt-2 flex flex-wrap justify-end gap-2 sm:col-span-2">
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
                {isEdit ? "ذخیرهٔ تغییرات" : "ایجاد پزشک"}
              </Button>
            </div>
          </form>
        </Form>
  );
}

/** @deprecated Use DoctorForm */
export const DoctorFormDialog = DoctorForm;
