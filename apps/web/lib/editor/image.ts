/** The longest side an inserted picture keeps (blueprint 01 §A). Larger pictures are scaled down. */
export const MAX_IMAGE_SIDE = 1600;

/** The size a width x height picture is drawn at so its longer side is at most `max`. Pictures already within the limit keep their size. */
export function fitWithin(width: number, height: number, max: number = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A PNG longer than this many characters of data URL is turned into a JPEG (v1 imgShrinkDataUrl). */
export const MAX_PNG_CHARS = 400000;
/** The JPEG quality of the large-PNG fallback and of the shrink step (v1). */
export const SHRINK_JPEG_QUALITY = 0.85;

/**
 * Redraws a picture data URL on a white canvas no larger than `max` on its longer side (v1 imgShrinkDataUrl). Redrawing drops EXIF.
 * A PNG source stays PNG only while the result is at most 400000 characters, otherwise (and for every other format) it is a JPEG
 * at q0.85. GIF and SVG data URLs, and anything that cannot be read, come back untouched.
 */
export function shrinkDataUrl(src: string, max: number = MAX_IMAGE_SIDE, quality: number = SHRINK_JPEG_QUALITY): Promise<string> {
  return new Promise((resolve) => {
    if (/^data:image\/(gif|svg)/.test(src)) return resolve(src);
    const im = new Image();
    im.onload = () => {
      try {
        const { width, height } = fitWithin(im.naturalWidth, im.naturalHeight, max);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(src);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(im, 0, 0, width, height);
        let out = "";
        if (/^data:image\/png/.test(src)) {
          out = canvas.toDataURL("image/png");
          if (out.length > MAX_PNG_CHARS) out = "";
        }
        resolve(out || canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(src);
      }
    };
    im.onerror = () => resolve(src);
    im.src = src;
  });
}

/**
 * Reads a picture file, redraws it on a canvas no larger than `max` on its longer side and returns it as a data URL: a JPEG for photos
 * (`image/jpeg`), a PNG for anything else, unless that PNG is longer than MAX_PNG_CHARS, when it is redrawn on white as a JPEG (v1
 * imgShrinkDataUrl 4325). Redrawing drops EXIF (camera, place, time); the browser applies the EXIF rotation while decoding.
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
    if (file.type === "image/jpeg") return canvas.toDataURL("image/jpeg", 0.9);
    const png = canvas.toDataURL("image/png");
    if (png.length <= MAX_PNG_CHARS) return png;
    // A large PNG (a screenshot) would fill the document body: v1 falls back to a JPEG on white, as the picture editor does.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", SHRINK_JPEG_QUALITY);
  } finally {
    bitmap.close();
  }
}
