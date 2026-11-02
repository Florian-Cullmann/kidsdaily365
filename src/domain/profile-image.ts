import { z } from "zod";

export const maxImageBytes = 8 * 1024 * 1024;
export const maxImagePixels = 20_000_000;
export const imageCropSchema = z.object({
  x: z.coerce.number().min(0).max(100).default(50),
  y: z.coerce.number().min(0).max(100).default(50),
  zoom: z.coerce.number().min(1).max(3).default(1),
}).strict();
export type ImageCrop = z.infer<typeof imageCropSchema>;
export function cropRectangle(width: number, height: number, crop: ImageCrop) {
  const size = Math.max(1, Math.floor(Math.min(width, height) / crop.zoom));
  return { left: Math.round((width - size) * crop.x / 100), top: Math.round((height - size) * crop.y / 100), width: size, height: size };
}
export function profileImageUrl(childId: string, version: string) {
  return `/api/children/${childId}/image?v=${version}`;
}
