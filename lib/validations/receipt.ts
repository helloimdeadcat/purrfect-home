/**
 * Receipt upload validation. The client's Content-Type and file name are not
 * trusted: the type is sniffed from the file's leading bytes and the stored
 * object name is server-generated. The client name is kept only (sanitised)
 * as a display label.
 */

/**
 * Below the bucket limit (10 MB) and with headroom under proxy.ts's 10 MB
 * request-body buffer (proxyClientMaxBodySize), which multipart overhead
 * would otherwise push a 10 MB file past.
 */
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
export const MAX_RECEIPTS_PER_TRANSACTION = 10;

export type ReceiptKind = {
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf";
  extension: "jpg" | "png" | "webp" | "heic" | "pdf";
};

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function sniffReceiptKind(bytes: Uint8Array): ReceiptKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 4, 4) === "ftyp" &&
    HEIC_BRANDS.has(ascii(bytes, 8, 4))
  ) {
    return { mimeType: "image/heic", extension: "heic" };
  }
  return null;
}

/** Display-only label: no path parts, no control characters, bounded length. */
export function sanitizeReceiptFileName(name: string | null | undefined): string {
  const base = (name ?? "").split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return "чек";
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

export type ReceiptCheck =
  | { ok: true; kind: ReceiptKind; size: number }
  | { ok: false; message: string };

export function validateReceiptBytes(bytes: Uint8Array): ReceiptCheck {
  if (bytes.length === 0) {
    return { ok: false, message: "Файл пустой" };
  }
  if (bytes.length > MAX_RECEIPT_BYTES) {
    return { ok: false, message: "Файл больше 8 МБ" };
  }
  const kind = sniffReceiptKind(bytes);
  if (!kind) {
    return {
      ok: false,
      message: "Неподдерживаемый формат — подойдут JPEG, PNG, WebP, HEIC или PDF",
    };
  }
  return { ok: true, kind, size: bytes.length };
}
