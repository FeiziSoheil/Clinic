/**
 * Media / image pipeline contracts.
 *
 * Upload backends vary (S3, local disk, CDN). The CMS talks only through
 * {@link ImageService} so editor dialogs and public renderers stay decoupled.
 */

export interface ImageAsset {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  blurDataURL?: string;
  caption?: string;
  createdAt: string;
}

export interface ImageUploadRequest {
  file: File;
  alt?: string;
  caption?: string;
}

export interface ImageTransformOptions {
  /** Target width in CSS pixels (source may be larger). */
  width?: number;
  height?: number;
  /** Crop rectangle in source-pixel coordinates. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Output quality 0–100 for lossy formats. */
  quality?: number;
  format?: "webp" | "avif" | "jpeg" | "png";
}

/** Service surface implemented by real upload backends or local stubs. */
export interface ImageService {
  upload(req: ImageUploadRequest): Promise<ImageAsset>;
  transform(assetId: string, options: ImageTransformOptions): Promise<ImageAsset>;
  get(assetId: string): Promise<ImageAsset | null>;
  delete(assetId: string): Promise<void>;
}
