/**
 * Client-side receipt image compression: phone photos are often 3–6 MB,
 * a 2000 px JPEG at q=0.8 is typically 300–700 KB and still sharp enough to
 * read (and to OCR). Saves Supabase Storage (1 GB) and egress.
 *
 * Never makes things worse: PDFs, unknown types, images the browser cannot
 * decode (e.g. HEIC outside Safari) and results that are not smaller are
 * returned unchanged. Server-side validation stays the source of truth.
 */

export const RECEIPT_MAX_SIDE_PX = 2000;
export const RECEIPT_JPEG_QUALITY = 0.8;
/** Below this, re-encoding saves too little to be worth the CPU. */
export const RECEIPT_COMPRESS_MIN_BYTES = 300 * 1024;

const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Scale (width, height) down so the longest side is ≤ maxSide; never up. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = RECEIPT_MAX_SIDE_PX,
): { width: number; height: number; scaled: boolean } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0, scaled: false };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height, scaled: false };
  const ratio = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    scaled: true,
  };
}

export function shouldTryCompress(type: string, size: number): boolean {
  return COMPRESSIBLE_TYPES.has(type.toLowerCase()) && size >= RECEIPT_COMPRESS_MIN_BYTES;
}

/** "IMG_1234.HEIC" → "IMG_1234.jpg" (display name only; the server names objects). */
export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base || "чек"}.jpg`;
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export async function compressReceiptImage(file: File): Promise<File> {
  if (typeof document === "undefined" || !shouldTryCompress(file.type, file.size)) return file;

  const decoded = await decode(file);
  if (!decoded) return file;

  try {
    const target = fitWithin(decoded.width, decoded.height);
    if (target.width === 0) return file;

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // PNG transparency would turn black in JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(decoded.source, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", RECEIPT_JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], jpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    decoded.close();
  }
}
