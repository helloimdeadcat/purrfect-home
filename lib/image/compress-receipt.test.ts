import { describe, expect, it } from "vitest";

import {
  RECEIPT_COMPRESS_MIN_BYTES,
  RECEIPT_MAX_SIDE_PX,
  compressReceiptImage,
  fitWithin,
  jpegFileName,
  shouldTryCompress,
} from "./compress-receipt";

describe("fitWithin", () => {
  it("scales a portrait phone photo so the long side hits the limit", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000, scaled: true });
  });

  it("scales landscape by the width", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200, scaled: true });
  });

  it("keeps a very long receipt strip at least 1 px wide", () => {
    expect(fitWithin(10, 100_000)).toEqual({ width: 1, height: 2000, scaled: true });
  });

  it("never upscales small or exactly-sized images", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(RECEIPT_MAX_SIDE_PX, 10)).toEqual({
      width: RECEIPT_MAX_SIDE_PX,
      height: 10,
      scaled: false,
    });
  });

  it("rejects broken dimensions", () => {
    expect(fitWithin(0, 100).scaled).toBe(false);
    expect(fitWithin(Number.NaN, 100).width).toBe(0);
  });
});

describe("shouldTryCompress", () => {
  it("only touches large images", () => {
    expect(shouldTryCompress("image/jpeg", RECEIPT_COMPRESS_MIN_BYTES)).toBe(true);
    expect(shouldTryCompress("IMAGE/PNG", 5_000_000)).toBe(true);
    expect(shouldTryCompress("image/jpeg", RECEIPT_COMPRESS_MIN_BYTES - 1)).toBe(false);
    expect(shouldTryCompress("application/pdf", 5_000_000)).toBe(false);
    expect(shouldTryCompress("", 5_000_000)).toBe(false);
  });
});

describe("jpegFileName", () => {
  it("swaps the extension", () => {
    expect(jpegFileName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
    expect(jpegFileName("scan.final.png")).toBe("scan.final.jpg");
    expect(jpegFileName("noext")).toBe("noext.jpg");
    expect(jpegFileName(".png")).toBe("чек.jpg");
  });
});

describe("compressReceiptImage", () => {
  it("returns PDFs untouched", async () => {
    const pdf = new File([new Uint8Array(RECEIPT_COMPRESS_MIN_BYTES * 2)], "a.pdf", {
      type: "application/pdf",
    });
    expect(await compressReceiptImage(pdf)).toBe(pdf);
  });
});
