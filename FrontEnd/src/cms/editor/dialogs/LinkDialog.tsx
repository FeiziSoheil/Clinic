"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialHref?: string;
  onSubmit: (href: string) => void;
  onRemove?: () => void;
}

export function LinkDialog({
  open,
  onOpenChange,
  initialHref = "",
  onSubmit,
  onRemove,
}: LinkDialogProps) {
  const [href, setHref] = useState(initialHref);

  useEffect(() => {
    if (open) setHref(initialHref);
  }, [open, initialHref]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>لینک</DialogTitle>
          <DialogDescription>
            آدرس لینک را وارد کنید. برای متن انتخاب‌شده اعمال می‌شود.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cms-link-href">آدرس</Label>
          <Input
            id="cms-link-href"
            dir="ltr"
            placeholder="https://…"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (href.trim()) {
                  onSubmit(href.trim());
                  onOpenChange(false);
                }
              }
            }}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              حذف لینک
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              disabled={!href.trim()}
              onClick={() => {
                onSubmit(href.trim());
                onOpenChange(false);
              }}
            >
              اعمال
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
