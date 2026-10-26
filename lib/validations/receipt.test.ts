import { describe, expect, it } from "vitest";

import {
  MAX_RECEIPT_BYTES,
  sanitizeReceiptFileName,
  sniffReceiptKind,
  validateReceiptBytes,
} from "./receipt";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) =>
      typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v],
    ),
  );

describe("sniffReceiptKind", () => {
  it("recognises allowed formats by signature", () => {
    expect(sniffReceiptKind(bytes(0xff, 0xd8, 0xff, 0xe0))?.mimeType).toBe("image/jpeg");
    expect(
      sniffReceiptKind(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))?.mimeType,
    ).toBe("image/png");
    expect(sniffReceiptKind(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))?.mimeType).toBe(
      "image/webp",
    );
    expect(sniffReceiptKind(bytes("%PDF-1.7\n"))?.mimeType).toBe("application/pdf");
    expect(sniffReceiptKind(bytes(0, 0, 0, 0x18, "ftypheic", 0))?.mimeType).toBe(
      "image/heic",
    );
  });

  it("rejects disguised or unknown content", () => {
    // HTML renamed to .pdf, SVG (script-capable), ZIP, MP4 (ftyp but not HEIC)
    expect(sniffReceiptKind(bytes("<html><script>"))).toBeNull();
    expect(sniffReceiptKind(bytes("<svg xmlns="))).toBeNull();
    expect(sniffReceiptKind(bytes("PK", 3, 4))).toBeNull();
    expect(sniffReceiptKind(bytes(0, 0, 0, 0x18, "ftypisom"))).toBeNull();
  });
});

describe("validateReceiptBytes", () => {
  it("rejects empty and oversized files", () => {
    expect(validateReceiptBytes(new Uint8Array())).toEqual({
      ok: false,
      message: "File is empty",
    });
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(validateReceiptBytes(big).ok).toBe(false);
  });

  it("accepts a valid file at the size limit", () => {
    const max = new Uint8Array(MAX_RECEIPT_BYTES);
    max.set([0xff, 0xd8, 0xff]);
    const result = validateReceiptBytes(max);
    expect(result.ok && result.kind.extension).toBe("jpg");
  });
});

describe("sanitizeReceiptFileName", () => {
  it("strips paths and control characters and bounds length", () => {
    expect(sanitizeReceiptFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeReceiptFileName("C:\\Users\\x\\scan.pdf")).toBe("scan.pdf");
    expect(sanitizeReceiptFileName("bon\u0000\u001b.jpg")).toBe("bon.jpg");
    expect(sanitizeReceiptFileName("")).toBe("receipt");
    expect(sanitizeReceiptFileName("a".repeat(300))).toHaveLength(120);
  });
});
