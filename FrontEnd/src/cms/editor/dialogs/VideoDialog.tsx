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

export interface VideoDialogValues {
  src: string;
  poster: string;
  caption: string;
}

export interface VideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<VideoDialogValues>;
  onSubmit: (values: VideoDialogValues) => void;
}

export function VideoDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: VideoDialogProps) {
  const [src, setSrc] = useState(initial?.src ?? "");
  const [poster, setPoster] = useState(initial?.poster ?? "");
  const [caption, setCaption] = useState(initial?.caption ?? "");

  useEffect(() => {
    if (open) {
      setSrc(initial?.src ?? "");
      setPoster(initial?.poster ?? "");
      setCaption(initial?.caption ?? "");
    }
  }, [open, initial?.src, initial?.poster, initial?.caption]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ویدیوی خودمیزبان</DialogTitle>
          <DialogDescription>
            فایل ویدیو را از دستگاه انتخاب کنید یا آدرس آن را وارد کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <MediaSourceField
            kind="video"
            label="منبع ویدیو"
            url={src}
            onUrlChange={setSrc}
            urlInputId="cms-video-src"
            urlPlaceholder="https://…/video.mp4"
          />
          <MediaSourceField
            kind="image"
            label="پوستر (اختیاری)"
            url={poster}
            onUrlChange={setPoster}
            urlInputId="cms-video-poster"
          />
          <div className="space-y-2">
            <Label htmlFor="cms-video-caption">عنوان</Label>
            <Input
              id="cms-video-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
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
              onSubmit({
                src: src.trim(),
                poster: poster.trim(),
                caption: caption.trim(),
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
