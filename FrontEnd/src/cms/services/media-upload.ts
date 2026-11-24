/**
 * CMS media upload client.
 *
 * Posts files to the Next.js `/api/cms/media` route (persists under
 * `public/uploads/cms/`). Falls back to an in-memory blob URL when the API is
 * unavailable (offline UI work). Swap this module when the Go backend exposes
 * `/api/v1/admin/media`.
 */

export type MediaKind = "image" | "video";

export interface MediaUploadResult {
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  /** True when the URL is a session-only blob — not persisted to disk. */
  ephemeral: boolean;
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

function maxBytesFor(kind: MediaKind): number {
  return kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}

function acceptFor(kind: MediaKind): string {
  return kind === "image" ? "image/*" : "video/*";
}

function validateFile(file: File, kind: MediaKind): string | null {
  const accept = acceptFor(kind);
  const prefix = accept.replace("/*", "/");
  if (!file.type.startsWith(prefix)) {
    return kind === "image"
      ? "فقط فایل‌های تصویری مجاز هستند."
      : "فقط فایل‌های ویدیویی مجاز هستند.";
  }
  const max = maxBytesFor(kind);
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return `حداکثر حجم مجاز ${mb} مگابایت است.`;
  }
  return null;
}

async function uploadViaApi(
  file: File,
  kind: MediaKind,
): Promise<MediaUploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);

  const res = await fetch("/api/cms/media", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `آپلود ناموفق (${res.status})`);
  }

  const data = (await res.json()) as {
    url: string;
    mime_type?: string;
    mimeType?: string;
    size_bytes?: number;
    sizeBytes?: number;
    file_name?: string;
    fileName?: string;
  };

  return {
    url: data.url,
    mimeType: data.mimeType ?? data.mime_type ?? file.type,
    sizeBytes: data.sizeBytes ?? data.size_bytes ?? file.size,
    fileName: data.fileName ?? data.file_name ?? file.name,
    ephemeral: false,
  };
}

function uploadViaBlob(file: File): MediaUploadResult {
  return {
    url: URL.createObjectURL(file),
    mimeType: file.type,
    sizeBytes: file.size,
    fileName: file.name,
    ephemeral: true,
  };
}

/**
 * Upload a local file and return a URL suitable for article JSON attrs.
 * Tries the Next.js API first; falls back to blob URL on failure.
 */
export async function uploadMediaFile(
  file: File,
  kind: MediaKind,
): Promise<MediaUploadResult> {
  const validationError = validateFile(file, kind);
  if (validationError) throw new Error(validationError);

  try {
    return await uploadViaApi(file, kind);
  } catch {
    return uploadViaBlob(file);
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

export { acceptFor, maxBytesFor, validateFile };
