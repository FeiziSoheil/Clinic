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

export interface YoutubeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSrc?: string;
  onSubmit: (src: string) => void;
}

export function YoutubeDialog({
  open,
  onOpenChange,
  initialSrc = "",
  onSubmit,
}: YoutubeDialogProps) {
  const [src, setSrc] = useState(initialSrc);

  useEffect(() => {
    if (open) setSrc(initialSrc);
  }, [open, initialSrc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ویدیوی یوتیوب</DialogTitle>
          <DialogDescription>
            لینک کامل ویدیو را از یوتیوب جای‌گذاری کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cms-youtube-src">لینک یوتیوب</Label>
          <Input
            id="cms-youtube-src"
            dir="ltr"
            placeholder="https://www.youtube.com/watch?v=…"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            انصراف
          </Button>
          <Button
            type="button"
            disabled={!src.trim()}
            onClick={() => {
              onSubmit(src.trim());
              onOpenChange(false);
            }}
          >
            درج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
