/**
 * Live check of receipt scanning with the key from .env.local (`npm run check:ai`).
 * 1) A generated plain white PNG (not a receipt) proves that images and JSON
 *    mode are accepted and that nothing is invented for a non-receipt.
 * 2) If `services/__fixtures__/receipt.jpg` exists (a photo of any receipt,
 *    not committed), it is scanned and the result is printed.
 * No household data is sent.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { getAiConfig } from "@/lib/ai/config";

import { scanReceipt } from "./receipt-scan-service";

function readEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  const file = path.resolve(import.meta.dirname, "../.env.local");
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const config = getAiConfig({ ...readEnvFile(), ...process.env });

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A plain white RGB PNG built with node's zlib only. */
function whitePng(width: number, height: number): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3, 0xff);
  row[0] = 0; // filter: none
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const categories = [
  { id: "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", name: "Продукты" },
  { id: "b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22", name: "Кафе и рестораны" },
  { id: "c3eebc99-9c0b-4ef8-bb6d-6bb9bd380a33", name: "Транспорт" },
];
const today = new Date().toISOString().slice(0, 10);
const fixture = path.resolve(import.meta.dirname, "__fixtures__/receipt.jpg");

describe.runIf(config)("receipt scan (live)", () => {
  it("accepts an image in JSON mode and invents nothing for a blank picture", async () => {
    const result = await scanReceipt(config!, {
      bytes: whitePng(64, 96),
      mimeType: "image/png",
      categories,
      today,
      currency: "EUR",
    });
    console.log(`blank image → ${JSON.stringify(result)}`);
    expect(result.amount).toBeNull();
  });

  it.runIf(existsSync(fixture))("reads services/__fixtures__/receipt.jpg", async () => {
    const result = await scanReceipt(config!, {
      bytes: new Uint8Array(readFileSync(fixture)),
      mimeType: "image/jpeg",
      categories,
      today,
      currency: "EUR",
    });
    console.log(`receipt.jpg → ${JSON.stringify(result)}`);
    expect(result.amount ?? result.merchant).not.toBeNull();
  });
});

describe.runIf(!config)("receipt scan (live)", () => {
  it.skip("AI_API_KEY is not set in .env.local", () => {});
});
