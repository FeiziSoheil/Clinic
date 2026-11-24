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
import { MediaSourceField } from "../components/MediaSourceField";

export interface ImageDialogValues {
  src: string;
  alt: string;
}

export interface ImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<ImageDialogValues>;
  onSubmit: (values: ImageDialogValues) => void;
}

export function ImageDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: ImageDialogProps) {
  const [src, setSrc] = useState(initial?.src ?? "");
  const [alt, setAlt] = useState(initial?.alt ?? "");

  useEffect(() => {
    if (open) {
      setSrc(initial?.src ?? "");
      setAlt(initial?.alt ?? "");
    }
  }, [open, initial?.src, initial?.alt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>درج تصویر</DialogTitle>
          <DialogDescription>
            فایل را از دستگاه انتخاب کنید یا آدرس تصویر را وارد کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <MediaSourceField
            kind="image"
            label="منبع تصویر"
            url={src}
            onUrlChange={setSrc}
            urlInputId="cms-image-src"
          />
          <div className="space-y-2">
            <Label htmlFor="cms-image-alt">متن جایگزین</Label>
            <Input
              id="cms-image-alt"
              placeholder="توضیح کوتاه تصویر"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
            />
          </div>
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
              onSubmit({ src: src.trim(), alt: alt.trim() || "تصویر مقاله" });
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
