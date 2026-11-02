import { describe, expect, it, vi } from "vitest";

import {
  RECEIPTS_BUDGET_BYTES,
  formatMegabytes,
  receiptBudgetError,
} from "./usage-service";

const HOUSEHOLD = "10000000-0000-0000-0000-000000000001";

function client(result: { data: unknown; error: { message: string } | null }) {
  return { rpc: vi.fn(async () => result) } as never;
}

describe("receiptBudgetError", () => {
  it("allows uploads that fit the household budget", async () => {
    const supabase = client({ data: [{ files: 3, bytes: 1_000_000 }], error: null });
    expect(await receiptBudgetError(supabase, HOUSEHOLD, 500_000)).toBeNull();
  });

  it("refuses with a friendly Russian message once the budget would be exceeded", async () => {
    const supabase = client({
      data: [{ files: 900, bytes: RECEIPTS_BUDGET_BYTES - 100 }],
      error: null,
    });
    const message = await receiptBudgetError(supabase, HOUSEHOLD, 200);
    expect(message).toMatch(/Место для чеков закончилось/);
    expect(message).toContain("800 МБ");
  });

  it("fails open when usage cannot be read (e.g. migration not applied)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await receiptBudgetError(client({ data: null, error: { message: "no fn" } }), HOUSEHOLD, 1),
    ).toBeNull();
    expect(await receiptBudgetError({} as never, HOUSEHOLD, 1)).toBeNull();
    warn.mockRestore();
  });
});

describe("formatMegabytes", () => {
  it("uses a decimal comma and drops decimals for big numbers", () => {
    expect(formatMegabytes(1.5 * 1024 * 1024)).toBe("1,5 МБ");
    expect(formatMegabytes(RECEIPTS_BUDGET_BYTES)).toBe("800 МБ");
  });
});
