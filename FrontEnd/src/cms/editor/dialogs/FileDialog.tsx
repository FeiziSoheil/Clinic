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

export interface FileDialogValues {
  href: string;
  fileName: string;
  fileSize: string;
}

export interface FileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<FileDialogValues>;
  onSubmit: (values: FileDialogValues) => void;
}

export function FileDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: FileDialogProps) {
  const [href, setHref] = useState(initial?.href ?? "");
  const [fileName, setFileName] = useState(initial?.fileName ?? "");
  const [fileSize, setFileSize] = useState(initial?.fileSize ?? "");

  useEffect(() => {
    if (open) {
      setHref(initial?.href ?? "");
      setFileName(initial?.fileName ?? "");
      setFileSize(initial?.fileSize ?? "");
    }
  }, [open, initial?.href, initial?.fileName, initial?.fileSize]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>پیوست فایل</DialogTitle>
          <DialogDescription>
            لینک دانلود و نام فایل را مشخص کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cms-file-href">آدرس فایل</Label>
            <Input
              id="cms-file-href"
              dir="ltr"
              placeholder="https://…/file.pdf"
              value={href}
              onChange={(e) => setHref(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cms-file-name">نام فایل</Label>
            <Input
              id="cms-file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cms-file-size">حجم (اختیاری)</Label>
            <Input
              id="cms-file-size"
              placeholder="مثلاً ۲٫۴ مگابایت"
              value={fileSize}
              onChange={(e) => setFileSize(e.target.value)}
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
            disabled={!href.trim() || !fileName.trim()}
            onClick={() => {
              onSubmit({
                href: href.trim(),
                fileName: fileName.trim(),
                fileSize: fileSize.trim(),
              });
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
