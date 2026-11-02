import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiError } from "@/lib/ai/client";
import { makeCtx } from "@/lib/test-utils/household-context";

const takeAiQuota = vi.fn();
const scanReceipt = vi.fn();
const getAiConfig = vi.fn();

vi.mock("@/lib/auth/api", async (original) => ({
  ...(await original<typeof import("@/lib/auth/api")>()),
  requireHousehold: async () => ({ ok: true, value: { supabase: {}, ctx: makeCtx() } }),
}));
vi.mock("@/lib/ai/config", () => ({ getAiConfig: () => getAiConfig() }));
vi.mock("@/lib/ai/rate-limit", () => ({ takeAiQuota: (...args: unknown[]) => takeAiQuota(...args) }));
vi.mock("@/lib/data/categories", () => ({
  listHouseholdCategories: async () => ({
    data: [
      { id: "cat-food", name: "Продукты", type: "expense" },
      { id: "cat-salary", name: "Зарплата", type: "income" },
      { id: "cat-gifts", name: "Подарки", type: "both" },
    ],
    error: null,
  }),
}));
vi.mock("@/services/settings-service", () => ({
  getHouseholdToday: async () => ({ today: "2026-10-27", timezone: "Europe/Berlin" }),
}));
vi.mock("@/services/receipt-scan-service", async (original) => ({
  ...(await original<typeof import("@/services/receipt-scan-service")>()),
  scanReceipt: (...args: unknown[]) => scanReceipt(...args),
}));

const { POST } = await import("./route");

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PDF = new TextEncoder().encode("%PDF-1.7 fake");

function upload(bytes: Uint8Array<ArrayBuffer> | null) {
  const form = new FormData();
  if (bytes) form.append("file", new File([bytes], "receipt.jpg"));
  return new Request("http://localhost/api/receipts/scan", { method: "POST", body: form });
}

const SCAN = { amount: "12.34", date: "2026-10-26", merchant: "REWE", categoryId: "cat-food", currency: "EUR", items: [] };

beforeEach(() => {
  takeAiQuota.mockReset().mockResolvedValue(true);
  scanReceipt.mockReset().mockResolvedValue(SCAN);
  getAiConfig.mockReset().mockReturnValue({ apiKey: "k", baseUrl: "https://ai.example/", model: "m" });
});

describe("POST /api/receipts/scan", () => {
  it("scans an image with the household's expense categories", async () => {
    const response = await POST(upload(JPEG));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SCAN);
    expect(takeAiQuota).toHaveBeenCalledWith(expect.anything(), expect.any(String), "receipt_scan");
    const [, scanInput] = scanReceipt.mock.calls[0] as [unknown, { mimeType: string; categories: { id: string }[]; today: string }];
    expect(scanInput.mimeType).toBe("image/jpeg");
    expect(scanInput.today).toBe("2026-10-27");
    expect(scanInput.categories.map((c) => c.id)).toEqual(["cat-food", "cat-gifts"]);
  });

  it("returns 503 when AI is not configured", async () => {
    getAiConfig.mockReturnValue(null);
    expect((await POST(upload(JPEG))).status).toBe(503);
    expect(scanReceipt).not.toHaveBeenCalled();
  });

  it("returns 429 when the quota is used up", async () => {
    takeAiQuota.mockResolvedValue(false);
    const response = await POST(upload(JPEG));
    expect(response.status).toBe(429);
    expect(scanReceipt).not.toHaveBeenCalled();
  });

  it("rejects a missing file, a non-image and a PDF without spending quota", async () => {
    expect((await POST(upload(null))).status).toBe(400);
    expect((await POST(upload(new TextEncoder().encode("hello")))).status).toBe(400);
    expect((await POST(upload(PDF))).status).toBe(400);
    expect(takeAiQuota).not.toHaveBeenCalled();
  });

  it("maps AI failures to 502 and provider rate limits to 429", async () => {
    scanReceipt.mockRejectedValueOnce(new AiError("Ошибка ИИ-сервиса (500)", "upstream"));
    const failed = await POST(upload(JPEG));
    expect(failed.status).toBe(502);
    expect(((await failed.json()) as { error: string }).error).toBe("Ошибка ИИ-сервиса (500)");

    scanReceipt.mockRejectedValueOnce(new AiError("limit", "rate_limited"));
    expect((await POST(upload(JPEG))).status).toBe(429);
  });
});
