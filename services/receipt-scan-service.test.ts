import { describe, expect, it, vi } from "vitest";

import {
  parseScannedAmount,
  parseScannedDate,
  scanReceipt,
  type ReceiptScanInput,
} from "./receipt-scan-service";

const config = { apiKey: "test", baseUrl: "https://ai.example/", model: "m" };

const GROCERIES = "a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CAFE = "b2eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

const input: ReceiptScanInput = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
  mimeType: "image/jpeg",
  categories: [
    { id: GROCERIES, name: "Продукты" },
    { id: CAFE, name: "Кафе" },
  ],
  today: "2026-10-27",
  currency: "EUR",
};

type SentBody = {
  model: string;
  temperature: number;
  response_format?: { type: string };
  messages: { role: string; content: unknown }[];
};

/** Fake OpenAI-compatible endpoint answering every request with `content`. */
function replying(content: string | null) {
  const bodies: SentBody[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, bodies };
}

describe("scanReceipt", () => {
  it("sends the image as a data URL in JSON mode and returns validated fields", async () => {
    const { fetchImpl, bodies } = replying(
      JSON.stringify({
        total: 23.4,
        currency: "eur",
        date: "2026-10-25",
        merchant: "  REWE   Markt\n Berlin ",
        category: 1,
        items: ["Milch", "Brot", 42, ""],
      }),
    );
    const result = await scanReceipt(config, input, fetchImpl);

    expect(result).toEqual({
      amount: "23.40",
      date: "2026-10-25",
      merchant: "REWE Markt Berlin",
      categoryId: GROCERIES,
      currency: "EUR",
      items: ["Milch", "Brot"],
    });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[0].temperature).toBe(0);
    const user = bodies[0].messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(user[0].text).toContain("1. Продукты");
    expect(user[0].text).toContain("2026-10-27");
    expect(user[1].image_url?.url).toBe(`data:image/jpeg;base64,${Buffer.from(input.bytes).toString("base64")}`);
  });

  it("accepts JSON wrapped in a code fence and a comma amount", async () => {
    const { fetchImpl } = replying('```json\n{"total": "12,34", "date": null, "merchant": null, "category": null, "items": []}\n```');
    const result = await scanReceipt(config, input, fetchImpl);
    expect(result).toMatchObject({ amount: "12.34", date: null, merchant: null, categoryId: null, currency: null, items: [] });
  });

  it("drops an unknown category, a future date and an impossible amount", async () => {
    const { fetchImpl } = replying(
      JSON.stringify({ total: -5, currency: "euro", date: "2026-10-28", merchant: 7, category: 99, items: "Milch" }),
    );
    expect(await scanReceipt(config, input, fetchImpl)).toEqual({
      amount: null,
      date: null,
      merchant: null,
      categoryId: null,
      currency: null,
      items: [],
    });
  });

  it("never passes through a category id the model made up", async () => {
    const { fetchImpl } = replying(JSON.stringify({ total: 5, category: GROCERIES }));
    expect((await scanReceipt(config, input, fetchImpl)).categoryId).toBeNull();
    const second = replying(JSON.stringify({ total: 5, category: "2" }));
    expect((await scanReceipt(config, input, second.fetchImpl)).categoryId).toBe(CAFE);
  });

  it("caps the item list and trims long names", async () => {
    const { fetchImpl } = replying(JSON.stringify({ total: 1, items: Array.from({ length: 30 }, (_, i) => `item ${i} ${"x".repeat(100)}`) }));
    const { items } = await scanReceipt(config, input, fetchImpl);
    expect(items).toHaveLength(10);
    expect(items.every((item) => item.length <= 80)).toBe(true);
  });

  it.each([["not json at all"], ["{broken"], ["[1, 2]"], [null]])("fails with an upstream AiError on garbage %j", async (content) => {
    const { fetchImpl } = replying(content);
    await expect(scanReceipt(config, input, fetchImpl)).rejects.toMatchObject({ kind: "upstream" });
  });

  it("passes provider errors through", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    await expect(scanReceipt(config, input, fetchImpl)).rejects.toMatchObject({ kind: "rate_limited" });
  });
});

describe("parseScannedAmount", () => {
  it.each([
    ["12,34", "12.34"],
    ["12.34", "12.34"],
    ["€ 12,3", "12.30"],
    ["1.234,56", "1234.56"],
    ["1,234.56", "1234.56"],
    ["1 234,56 EUR", "1234.56"],
    ["1.234", "1234.00"],
    ["7", "7.00"],
    [19.999, "20.00"],
    [1_000_000, "1000000.00"],
  ])("%j → %s", (value, expected) => {
    expect(parseScannedAmount(value)).toBe(expected);
  });

  it.each([[0], ["0,00"], [-3], ["-3"], [1_000_000.01], ["abc"], [""], [null], [Number.NaN], [{}], ["1.2.3,4,5"]])(
    "rejects %j",
    (value) => {
      expect(parseScannedAmount(value)).toBeNull();
    },
  );
});

describe("parseScannedDate", () => {
  const today = "2026-10-27";
  it("keeps today and recent dates", () => {
    expect(parseScannedDate("2026-10-27", today)).toBe("2026-10-27");
    expect(parseScannedDate("2025-11-01", today)).toBe("2025-11-01");
  });
  it.each([["2026-10-28"], ["2025-10-01"], ["2026-02-30"], ["27.10.2026"], [20261027], [null]])("rejects %j", (value) => {
    expect(parseScannedDate(value, today)).toBeNull();
  });
});
