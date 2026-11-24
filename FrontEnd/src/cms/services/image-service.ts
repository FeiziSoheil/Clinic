/**
 * Image pipeline — uploads via {@link uploadMediaFile} (Next.js API → public disk)
 * with blob-URL fallback when the API is unreachable.
 *
 * Swap {@link setImageService} for a real S3/CDN client when the Go backend
 * exposes media endpoints.
 */

import type {
  ImageAsset,
  ImageService,
  ImageTransformOptions,
  ImageUploadRequest,
} from "../types/media";
import { uploadMediaFile } from "./media-upload";

const memory = new Map<string, ImageAsset>();

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !file.type.startsWith("image/")) {
      resolve({ width: 1200, height: 630 });
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1200, height: img.naturalHeight || 630 });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1200, height: 630 });
    };
    img.src = url;
  });
}

export function createStubImageService(): ImageService {
  return {
    async upload(req: ImageUploadRequest): Promise<ImageAsset> {
      const { width, height } = await readDimensions(req.file);
      const uploaded = await uploadMediaFile(req.file, "image");
      const id = `img-${Math.random().toString(36).slice(2, 10)}`;
      const asset: ImageAsset = {
        id,
        url: uploaded.url,
        alt: req.alt?.trim() || req.file.name,
        width,
        height,
        mimeType: uploaded.mimeType || req.file.type || "image/jpeg",
        sizeBytes: uploaded.sizeBytes,
        caption: req.caption,
        blurDataURL:
          "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iNiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjY2VlOGU2Ii8+PC9zdmc+",
        createdAt: new Date().toISOString(),
      };
      memory.set(id, asset);
      return asset;
    },

    async transform(
      assetId: string,
      _options: ImageTransformOptions,
    ): Promise<ImageAsset> {
      const existing = memory.get(assetId);
      if (!existing) throw new Error("image asset not found");
      // Stub: return the same asset. Real impl would crop/resize/compress.
      return existing;
    },

    async get(assetId: string): Promise<ImageAsset | null> {
      return memory.get(assetId) ?? null;
    },

    async delete(assetId: string): Promise<void> {
      const asset = memory.get(assetId);
      if (asset?.url.startsWith("blob:") && typeof URL !== "undefined") {
        URL.revokeObjectURL(asset.url);
      }
      memory.delete(assetId);
    },
  };
}

let singleton: ImageService | null = null;

/** App-wide image service (stub by default). */
export function getImageService(): ImageService {
  if (!singleton) singleton = createStubImageService();
  return singleton;
}

export function setImageService(service: ImageService): void {
  singleton = service;
}
