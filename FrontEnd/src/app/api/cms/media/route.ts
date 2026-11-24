import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
]);

const VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
};

function sanitizeBaseName(name: string): string {
  const base = path.basename(name, path.extname(name));
  const safe = base
    .normalize("NFKC")
    .replace(/[^\w\u0600-\u06FF.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return safe || "media";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "بدنهٔ درخواست نامعتبر است." }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "image");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "فایلی انتخاب نشده است." }, { status: 400 });
  }

  const isImage = kind === "image" || file.type.startsWith("image/");
  const isVideo = kind === "video" || file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "فقط فایل تصویر یا ویدیو مجاز است." },
      { status: 400 },
    );
  }

  const maxBytes = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return NextResponse.json(
      { error: `حداکثر حجم مجاز ${mb} مگابایت است.` },
      { status: 413 },
    );
  }

  const mime = file.type || (isImage ? "image/jpeg" : "video/mp4");
  if (isImage && !IMAGE_MIME.has(mime)) {
    return NextResponse.json({ error: "نوع تصویر پشتیبانی نمی‌شود." }, { status: 415 });
  }
  if (isVideo && !VIDEO_MIME.has(mime)) {
    return NextResponse.json({ error: "نوع ویدیو پشتیبانی نمی‌شود." }, { status: 415 });
  }

  const ext =
    EXT_BY_MIME[mime] ??
    (path.extname(file.name) || (isImage ? ".jpg" : ".mp4"));
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `${randomUUID().slice(0, 8)}-${sanitizeBaseName(file.name)}${ext}`;

  const uploadDir = path.join(process.cwd(), "public", "uploads", "cms", stamp);
  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), buffer);

  const publicUrl = `/uploads/cms/${stamp}/${fileName}`;

  return NextResponse.json({
    url: publicUrl,
    mime_type: mime,
    size_bytes: file.size,
    file_name: fileName,
  });
}
