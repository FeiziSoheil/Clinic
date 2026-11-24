/**
 * Video upload service — mirrors the image pipeline stub/API split.
 */

import { uploadMediaFile, type MediaUploadResult } from "./media-upload";

export interface VideoAsset {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  posterUrl?: string;
  caption?: string;
  ephemeral: boolean;
  createdAt: string;
}

export interface VideoUploadRequest {
  file: File;
  caption?: string;
  posterUrl?: string;
}

export interface VideoService {
  upload(req: VideoUploadRequest): Promise<VideoAsset>;
}

function toAsset(result: MediaUploadResult, req: VideoUploadRequest): VideoAsset {
  return {
    id: `vid-${Math.random().toString(36).slice(2, 10)}`,
    url: result.url,
    mimeType: result.mimeType,
    sizeBytes: result.sizeBytes,
    fileName: result.fileName,
    posterUrl: req.posterUrl,
    caption: req.caption,
    ephemeral: result.ephemeral,
    createdAt: new Date().toISOString(),
  };
}

export function createVideoService(): VideoService {
  return {
    async upload(req: VideoUploadRequest): Promise<VideoAsset> {
      const result = await uploadMediaFile(req.file, "video");
      return toAsset(result, req);
    },
  };
}

let singleton: VideoService | null = null;

export function getVideoService(): VideoService {
  if (!singleton) singleton = createVideoService();
  return singleton;
}

export function setVideoService(service: VideoService): void {
  singleton = service;
}
