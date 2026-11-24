"use client";

/**
 * Quick-registration form for the staff panel drawer.
 *
 * Lets the receptionist add a walk-in or phone patient to a doctor's waiting
 * list without creating a full patient account first.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useJoinWaitingList } from "@/hooks/useBooking";
import type {
  WaitingEntryType,
  WaitingPriority,
} from "@/types/booking";

const entryTypeLabels: Record<WaitingEntryType, string> = {
  ONLINE: "آنلاین",
  WALKIN: "حضوری",
  PHONE: "تلفنی",
};

const priorityLabels: Record<WaitingPriority, string> = {
  NORMAL: "عادی",
  URGENT: "فوری",
};

export interface QuickRegisterFormProps {
  doctorId: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  onDone: () => void;
  onCancel: () => void;
}

export function QuickRegisterForm({
  doctorId,
  date,
  onDone,
  onCancel,
}: QuickRegisterFormProps) {
  const joinWaiting = useJoinWaitingList();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [entryType, setEntryType] = useState<WaitingEntryType>("WALKIN");
  const [priority, setPriority] = useState<WaitingPriority>("NORMAL");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("نام بیمار را وارد کنید.");
      return;
    }
    if (!doctorId) {
      toast.error("شناسهٔ پزشک قابل تشخیص نیست.");
      return;
    }

    const syntheticPatientId = `${entryType.toLowerCase()}-${Date.now().toString(36)}`;

    joinWaiting.mutate(
      {
        doctor_id: doctorId,
        patient_id: syntheticPatientId,
        date,
        patient_name: name.trim(),
        phone: phone.trim() || undefined,
        entry_type: entryType,
        priority,
      },
      {
        onSuccess: () => {
          toast.success(`${name.trim()} به لیست انتظار اضافه شد.`);
          onDone();
        },
        onError: (err) =>
          toast.error((err as Error)?.message ?? "افزودن ناموفق بود."),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="quickreg-name">نام و نام خانوادگی</Label>
        <Input
          id="quickreg-name"
          placeholder="مثال: مریم حسینی"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="quickreg-phone">شماره تماس</Label>
        <Input
          id="quickreg-phone"
          type="tel"
          inputMode="tel"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="quickreg-type">نوع ثبت</Label>
          <Select
            value={entryType}
            onValueChange={(v) => setEntryType(v as WaitingEntryType)}
          >
            <SelectTrigger id="quickreg-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WALKIN">{entryTypeLabels.WALKIN}</SelectItem>
              <SelectItem value="PHONE">{entryTypeLabels.PHONE}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="quickreg-priority">اولویت</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as WaitingPriority)}
          >
            <SelectTrigger id="quickreg-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NORMAL">{priorityLabels.NORMAL}</SelectItem>
              <SelectItem value="URGENT">{priorityLabels.URGENT}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={joinWaiting.isPending}
        >
          انصراف
        </Button>
        <Button type="submit" disabled={joinWaiting.isPending}>
          {joinWaiting.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          افزودن به لیست انتظار
        </Button>
      </div>
    </form>
  );
}
