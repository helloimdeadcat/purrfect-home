import { describe, expect, it } from "vitest";

import {
  calculateAccountBalance,
  summarizeBalancesByCurrency,
} from "./account-balance";

describe("calculateAccountBalance", () => {
  it("ignores soft-deleted transactions", () => {
    const balance = calculateAccountBalance({
      accountId: "a1",
      initialBalance: "100.00",
      transactions: [
        { type: "expense", amount: "40.00", deleted_at: null },
        { type: "expense", amount: "25.00", deleted_at: "2026-01-01T00:00:00Z" },
      ],
      transfers: [],
    });
    expect(balance).toBe("60.00");
  });

  it("does not treat transfer table moves as income/expense rows", () => {
    const balance = calculateAccountBalance({
      accountId: "a1",
      initialBalance: "100.00",
      transactions: [{ type: "transfer", amount: "50.00", deleted_at: null }],
      transfers: [
        {
          from_account_id: "a1",
          to_account_id: "a2",
          amount: "30.00",
        },
      ],
    });
    expect(balance).toBe("70.00");
  });

  it("applies adjustment increase and decrease", () => {
    const up = calculateAccountBalance({
      accountId: "a1",
      initialBalance: "100.00",
      transactions: [
        {
          type: "adjustment",
          amount: "5.00",
          adjustment_direction: "increase",
          deleted_at: null,
        },
      ],
      transfers: [],
    });
    const down = calculateAccountBalance({
      accountId: "a1",
      initialBalance: "100.00",
      transactions: [
        {
          type: "adjustment",
          amount: "5.00",
          adjustment_direction: "decrease",
          deleted_at: null,
        },
      ],
      transfers: [],
    });
    expect(up).toBe("105.00");
    expect(down).toBe("95.00");
  });
});

describe("summarizeBalancesByCurrency", () => {
  it("never mixes currencies into one total", () => {
    const summary = summarizeBalancesByCurrency(
      [
        { currency: "EUR", balance: "100.00", is_active: true },
        { currency: "USD", balance: "50.00", is_active: true },
        { currency: "EUR", balance: "20.00", is_active: true },
      ],
      "EUR",
    );

    expect(summary.baseTotal).toBe("120.00");
    expect(summary.otherCurrencies).toEqual([
      { currency: "USD", total: "50.00" },
    ]);
    expect(summary.fxConversionAvailable).toBe(false);
  });
});
