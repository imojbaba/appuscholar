/** The longest side an inserted picture keeps (blueprint 01 §A). Larger pictures are scaled down. */
export const MAX_IMAGE_SIDE = 1600;

/** The size a width x height picture is drawn at so its longer side is at most `max`. Pictures already within the limit keep their size. */
export function fitWithin(width: number, height: number, max: number = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Reads a picture file, redraws it on a canvas no larger than `max` on its longer side and returns it as a data URL: a JPEG for photos
 * (`image/jpeg`), a PNG for anything else. Redrawing drops EXIF (camera, place, time); the browser applies the EXIF rotation while decoding.
 */
export async function resizeImage(file: File, max: number = MAX_IMAGE_SIDE): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
