"use client";

import { useId, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, VideoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  acceptFor,
  formatFileSize,
  uploadMediaFile,
  type MediaKind,
} from "@/cms/services/media-upload";
import { cn } from "@/lib/utils";

export interface MediaSourceFieldProps {
  kind: MediaKind;
  label: string;
  url: string;
  onUrlChange: (url: string) => void;
  urlInputId?: string;
  urlPlaceholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MediaSourceField({
  kind,
  label,
  url,
  onUrlChange,
  urlInputId,
  urlPlaceholder,
  disabled = false,
  className,
}: MediaSourceFieldProps) {
  const autoId = useId();
  const inputId = urlInputId ?? `${autoId}-url`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "url">("upload");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<number | null>(null);
  const [ephemeral, setEphemeral] = useState(false);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const result = await uploadMediaFile(file, kind);
      onUrlChange(result.url);
      setPreviewName(result.fileName);
      setPreviewSize(result.sizeBytes);
      setEphemeral(result.ephemeral);
      setTab("upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : "آپلود ناموفق بود.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const Icon = kind === "image" ? ImageIcon : VideoIcon;
  const hasPreview = Boolean(url.trim());

  return (
    <div className={cn("space-y-3", className)}>
      <Label htmlFor={tab === "url" ? inputId : undefined}>{label}</Label>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "upload" | "url")}
        className="gap-3"
      >
        <TabsList className="w-full">
          <TabsTrigger value="upload" className="flex-1" disabled={disabled}>
            <Upload className="size-3.5" />
            انتخاب فایل
          </TabsTrigger>
          <TabsTrigger value="url" className="flex-1" disabled={disabled}>
            آدرس URL
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptFor(kind)}
              className="sr-only"
              id={`${inputId}-file`}
              disabled={disabled || uploading}
              aria-label={`${label} — انتخاب از دستگاه`}
              onChange={(e) => void handleFileChange(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4" />
              )}
              {uploading ? "در حال آپلود…" : "انتخاب از دستگاه"}
            </Button>
            {previewName ? (
              <span className="truncate text-xs text-muted-foreground" dir="ltr">
                {previewName}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {kind === "image"
              ? "فرمت‌های مجاز: WebP، JPG، PNG و …"
              : "فرمت‌های مجاز: MP4، WebM و …"}
          </p>
        </TabsContent>

        <TabsContent value="url" className="space-y-2">
          <Input
            id={inputId}
            dir="ltr"
            placeholder={urlPlaceholder ?? (kind === "image" ? "/Images/…" : "https://…/video.mp4")}
            value={url}
            disabled={disabled}
            onChange={(e) => {
              setError(null);
              setEphemeral(false);
              setPreviewName(null);
              setPreviewSize(null);
              onUrlChange(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">یا آدرس را مستقیم وارد کنید</p>
        </TabsContent>
      </Tabs>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {ephemeral ? (
        <p className="text-xs text-amber-600 dark:text-amber-500" role="status">
          پیش‌نمایش موقت — فایل روی سرور ذخیره نشد. اتصال را بررسی کنید یا دوباره آپلود کنید.
        </p>
      ) : null}

      {hasPreview ? (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="پیش‌نمایش تصویر انتخاب‌شده"
              className="max-h-40 w-full object-contain"
            />
          ) : (
            <video
              src={url}
              controls
              preload="metadata"
              className="max-h-40 w-full"
              aria-label="پیش‌نمایش ویدیوی انتخاب‌شده"
            />
          )}
          {previewName ? (
            <p className="border-t border-border/40 px-3 py-1.5 text-xs text-muted-foreground">
              {previewSize != null ? `${formatFileSize(previewSize)} — ` : null}
              <span dir="ltr">{previewName}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
