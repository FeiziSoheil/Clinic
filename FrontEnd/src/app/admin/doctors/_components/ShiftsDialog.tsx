"use client";

/**
 * Weekly-shifts management dialog.
 *
 * Lists a doctor's existing weekly shifts and lets the admin add a new
 * recurring shift (day + time range) or remove an existing one.
 * Uses the shift hooks from [`useAdminDoctors.ts`](src/hooks/useAdminDoctors.ts).
 *
 * Days of the week use the Go `time.Weekday`-derived constants (SUNDAY..SATURDAY).
 */

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteDoctorShift,
  useDoctorShifts,
  useUpsertDoctorShift,
} from "@/hooks/useAdminDoctors";
import {
  DAYS_OF_WEEK,
  type AdminDoctor,
  type DayOfWeek,
} from "@/types/admin-doctor";

/** Persian labels for the days of the week (Go `time.Weekday` order). */
const DAY_LABELS: Record<DayOfWeek, string> = {
  SUNDAY: "یکشنبه",
  MONDAY: "دوشنبه",
  TUESDAY: "سه‌شنبه",
  WEDNESDAY: "چهارشنبه",
  THURSDAY: "پنجشنبه",
  FRIDAY: "جمعه",
  SATURDAY: "شنبه",
};

export interface ShiftsPanelProps {
  doctor: AdminDoctor;
  onCancel: () => void;
}

export function ShiftsPanel({ doctor, onCancel }: ShiftsPanelProps) {
  const doctorId = doctor.id;
  const { data: shifts, isLoading } = useDoctorShifts(doctorId);
  const upsertMutation = useUpsertDoctorShift();
  const deleteMutation = useDeleteDoctorShift();

  // Local form state for adding a shift.
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>("SATURDAY");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Reset the add-shift form on mount / doctor change.
  useEffect(() => {
    // Intentional: reset the add-shift form when the panel mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayOfWeek("SATURDAY");
    setStartTime("09:00");
    setEndTime("13:00");
    setConfirmDelete(null);
  }, [doctor]);

  const isPending = upsertMutation.isPending || deleteMutation.isPending;

  async function handleAddShift() {
    // Simple client-side ordering check.
    if (startTime >= endTime) return;
    await upsertMutation.mutateAsync({
      doctorId: doctor.id,
      req: {
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      },
    });
  }

  async function handleRemoveShift(shiftId: string) {
    await deleteMutation.mutateAsync({ doctorId: doctor.id, shiftId });
    setConfirmDelete(null);
  }

  return (
    <div className="flex flex-col gap-4">
        {/* Existing shifts */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>روز</TableHead>
                <TableHead>ساعت</TableHead>
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center">
                    <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !shifts || shifts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    هنوز شیفت هفتگی‌ای تعریف نشده است.
                  </TableCell>
                </TableRow>
              ) : (
                shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {DAY_LABELS[s.day_of_week] ?? capitalize(s.day_of_week)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {s.start_time} – {s.end_time}
                    </TableCell>
                    <TableCell className="text-end">
                      {confirmDelete === s.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                             variant="ghost"
                             size="sm"
                             disabled={isPending}
                             onClick={() => setConfirmDelete(null)}
                           >
                             انصراف
                           </Button>
                           <Button
                             variant="destructive"
                             size="sm"
                             disabled={isPending}
                             onClick={() => handleRemoveShift(s.id)}
                           >
                             تأیید
                           </Button>
                        </div>
                      ) : (
                       <Button
                         variant="ghost"
                         size="sm"
                         disabled={isPending}
                         onClick={() => setConfirmDelete(s.id)}
                       >
                        <Trash2 className="size-4 text-destructive" />
                        <span className="sr-only">حذف شیفت</span>
                       </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add-shift form */}
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">افزودن شیفت هفتگی</h4>
            <Badge variant="secondary">{DAY_LABELS[dayOfWeek] ?? capitalize(dayOfWeek)}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ShiftField label="روز">
              <Select
                value={dayOfWeek}
                onValueChange={(v) => setDayOfWeek(v as DayOfWeek)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="روز" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DAY_LABELS[d] ?? capitalize(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ShiftField>

            <ShiftField label="شروع">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </ShiftField>

            <ShiftField label="پایان">
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </ShiftField>
          </div>

          {startTime >= endTime && (
            <p className="text-sm text-destructive">
              ساعت پایان باید بعد از شروع باشد.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            بستن
          </Button>
          <Button
            disabled={isPending || startTime >= endTime}
            onClick={handleAddShift}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            افزودن شیفت
          </Button>
        </div>
    </div>
  );
}

/** @deprecated Use ShiftsPanel */
export const ShiftsDialog = ShiftsPanel;

/** Small labelled wrapper used by the add-shift grid. */
function ShiftField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/** Capitalize the first letter of a lowercase-friendly string. */
function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
