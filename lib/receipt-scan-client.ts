/**
 * Browser side of the receipt scan: shrink the photo, send it to
 * /api/receipts/scan, return the draft fields. Nothing is stored.
 */
import type { ReceiptScanResult } from "@/services/receipt-scan-service";

export type { ReceiptScanResult };

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.8;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Re-encodes the photo as a JPEG with the longest side ≤ 1600 px. Formats the
 * browser cannot decode (e.g. HEIC outside Safari) are returned unchanged and
 * the server sends them as they are.
 */
export async function downscaleForScan(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff"; // transparent PNGs would turn black in JPEG
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

export async function requestReceiptScan(
  file: File,
): Promise<{ ok: true; result: ReceiptScanResult } | { ok: false; message: string }> {
  const image = await downscaleForScan(file);
  if (image.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Фото больше 8 МБ — попробуй снять чек поближе или выбрать другое фото" };
  }
  const body = new FormData();
  body.append("file", image, image === file ? file.name : "receipt.jpg");
  try {
    const response = await fetch("/api/receipts/scan", { method: "POST", body });
    const data = (await response.json().catch(() => null)) as (ReceiptScanResult & { error?: string }) | null;
    if (!response.ok || !data) {
      return { ok: false, message: data?.error ?? "Не получилось распознать чек — попробуй ещё раз" };
    }
    return { ok: true, result: data };
  } catch {
    return { ok: false, message: "Ошибка сети — проверь подключение и попробуй ещё раз" };
  }
}
