"use client";

/**
 * Doctor — Receptionist Management.
 *
 * Route: `/doctor/receptionists`.
 *
 * Shows the list of receptionists scoped to the signed-in doctor (fetched from
 * `GET /v1/doctor/receptionists`) in a responsive table, plus a CREATE form
 * (react-hook-form + zod) that mints a new receptionist. On a successful
 * create the list query is invalidated so the new entry shows up immediately.
 *
 * Matches the doctor page styling (Persian/RTL, shadcn Cards/Table, lucide
 * icons).
 */

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Loader2,
  Phone,
  UserCircle2,
  UserPlus,
  CheckCircle2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateReceptionist,
  useListReceptionists,
} from "@/hooks/useReceptionist";
import type { ReceptionistResponse } from "@/types/user";

/** Zod schema for the create form. */
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
  // Username is the staff login identifier (receptionists authenticate with
  // username + password, patients use OTP).
  username: z
    .string()
    .min(3, "نام کاربری باید حداقل ۳ کاراکتر باشد")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد",
    ),
  password: z
    .string()
    .min(6, "رمز عبور حداقل ۶ کاراکتر باشد"),
});

/** Form-values type derived from the schema. */
type FormValues = z.infer<typeof schema>;

export default function DoctorReceptionistsPage() {
  const createMutation = useCreateReceptionist();
  const { data: receptionists, isLoading, isError } = useListReceptionists();
  const [created, setCreated] = useState<ReceptionistResponse | null>(null);

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

  const isPending = createMutation.isPending;

  async function onSubmit(values: FormValues) {
    const res = await createMutation.mutateAsync(values);
    setCreated(res);
    form.reset();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <UserPlus className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">منشی‌ها</h1>
          <p className="text-sm text-muted-foreground">
            مدیریت و ساخت حساب کاربری منشی برای مطب خود.
          </p>
        </div>
      </div>

      {/* Receptionists list */}
      <Card>
        <CardHeader>
          <CardTitle>منشی‌های شما</CardTitle>
          <CardDescription>
            منشی‌هایی که به شما متصل هستند و می‌توانند برنامه و نوبت‌های شما را
            مدیریت کنند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              بارگذاری لیست منشی‌ها ناموفق بود. لطفاً دوباره تلاش کنید.
            </p>
          ) : !receptionists || receptionists.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <UserCircle2 className="size-10 text-muted-foreground" />
              <p className="font-medium">هنوز منشی‌ای ثبت نشده است.</p>
              <p className="text-sm text-muted-foreground">
                از طریق فرم زیر می‌توانید اولین منشی خود را بسازید.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>نام و نام خانوادگی</TableHead>
                    <TableHead>نام کاربری</TableHead>
                    <TableHead>شماره موبایل</TableHead>
                    <TableHead>کد ملی</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receptionists.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.first_name} {r.last_name}
                      </TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {r.username || "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-right">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3.5 text-muted-foreground" />
                          {r.phone}
                        </span>
                      </TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {r.national_code || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Success state */}
      {created && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CheckCircle2 className="size-10 text-green-600" />
            <div className="space-y-1">
              <p className="font-medium">منشی ساخته شد.</p>
              <p className="text-sm text-muted-foreground">
                {created.first_name} {created.last_name} ({created.phone}) با
                موفقیت ثبت شد.
              </p>
              <p className="text-xs text-muted-foreground">
                منشی می‌تواند از طریق صفحهٔ ورود، با نام کاربری و رمز عبور وارد
                سامانه شود.
              </p>
            </div>
            <Button variant="outline" onClick={() => setCreated(null)}>
              ساخت منشی جدید
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>ساخت منشی جدید</CardTitle>
          <CardDescription>
            منشی ساخته‌شده به شما (پزشک) متصل می‌شود. پس از ساخت، منشی از طریق
            صفحهٔ ورود وارد سامانه می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                      <Input placeholder="نام" {...field} />
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
                      <Input placeholder="نام خانوادگی" {...field} />
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
                    <FormLabel>شماره موبایل</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="09xxxxxxxxx"
                        inputMode="tel"
                        dir="ltr"
                        {...field}
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
                      <Input
                        placeholder="کد ملی ۱۰ رقمی"
                        inputMode="numeric"
                        dir="ltr"
                        {...field}
                      />
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
                      <Input
                        dir="ltr"
                        autoComplete="username"
                        placeholder="مثلاً: receptionist1"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>رمز عبور</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="رمز عبور اولیه"
                        dir="ltr"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="sm:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  ساخت منشی
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
