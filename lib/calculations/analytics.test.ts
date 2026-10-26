import { describe, expect, it } from "vitest";

import {
  aggregateByCategory,
  aggregateMonthlyCashFlow,
  compareCategoryExpenses,
  filterAnalyticsTxns,
  percentChangeMoney,
  sumIncomeExpense,
  type AnalyticsTxn,
} from "./analytics";
import {
  previousComparablePeriod,
  resolveAnalyticsPeriod,
} from "./analytics-period";

const base: AnalyticsTxn[] = [
  {
    type: "expense",
    amount: "50.00",
    currency: "EUR",
    transaction_date: "2026-10-05",
    category_id: "food",
    account_id: "a1",
  },
  {
    type: "income",
    amount: "100.00",
    currency: "EUR",
    transaction_date: "2026-10-01",
    category_id: "salary",
    account_id: "a1",
  },
  {
    type: "expense",
    amount: "20.00",
    currency: "USD",
    transaction_date: "2026-10-05",
    category_id: "food",
    account_id: "a2",
  },
  {
    type: "expense",
    amount: "10.00",
    currency: "EUR",
    transaction_date: "2026-10-05",
    category_id: "food",
    account_id: "a1",
    deleted_at: "2026-10-06T00:00:00Z",
  },
];

describe("analytics aggregations", () => {
  it("excludes other currencies and deleted rows; never mixes FX", () => {
    const filtered = filterAnalyticsTxns(base, {
      currency: "EUR",
      range: { start: "2026-10-01", end: "2026-10-31" },
    });
    expect(filtered).toHaveLength(2);
    const totals = sumIncomeExpense(filtered);
    expect(totals.income).toBe("100.00");
    expect(totals.expense).toBe("50.00");
    expect(totals.net).toBe("50.00");
  });

  it("aggregates monthly cash flow and category expenses", () => {
    const filtered = filterAnalyticsTxns(base, {
      currency: "EUR",
      range: { start: "2026-10-01", end: "2026-10-31" },
    });
    const monthly = aggregateMonthlyCashFlow(filtered, {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(monthly).toHaveLength(1);
    expect(monthly[0]?.expense).toBe("50.00");

    const byCat = aggregateByCategory(
      filtered,
      "expense",
      new Map([["food", "Food"]]),
    );
    expect(byCat[0]?.categoryName).toBe("Food");
    expect(byCat[0]?.amount).toBe("50.00");
  });

  it("compares categories across periods", () => {
    const current = filterAnalyticsTxns(base, {
      currency: "EUR",
      range: { start: "2026-10-01", end: "2026-10-31" },
    });
    const previous: AnalyticsTxn[] = [
      {
        type: "expense",
        amount: "30.00",
        currency: "EUR",
        transaction_date: "2026-09-10",
        category_id: "food",
      },
    ];
    const rows = compareCategoryExpenses(
      current,
      previous,
      new Map([["food", "Food"]]),
    );
    expect(rows[0]?.current).toBe("50.00");
    expect(rows[0]?.previous).toBe("30.00");
    expect(rows[0]?.delta).toBe("20.00");
  });

  it("handles percent change with zero previous without Infinity", () => {
    expect(percentChangeMoney("10.00", "0.00")).toEqual({
      kind: "from_zero",
      direction: "up",
    });
    expect(percentChangeMoney("0.00", "0.00")).toEqual({ kind: "equal_zero" });
    expect(percentChangeMoney("150.00", "100.00")).toEqual({
      kind: "value",
      percent: 50,
    });
  });

  it("keeps the sign of percent change aligned with direction for negative bases", () => {
    // Net improved from −100 to −50.
    expect(percentChangeMoney("-50.00", "-100.00")).toEqual({
      kind: "value",
      percent: 50,
    });
    // Net worsened from −100 to −150.
    expect(percentChangeMoney("-150.00", "-100.00")).toEqual({
      kind: "value",
      percent: -50,
    });
    expect(percentChangeMoney("-20.00", "0.00")).toEqual({
      kind: "from_zero",
      direction: "down",
    });
  });

  it("resolves periods and previous comparable windows", () => {
    const range = resolveAnalyticsPeriod("previous_month", {
      today: "2026-10-18",
    });
    expect(range).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    const prev = previousComparablePeriod({
      start: "2026-10-01",
      end: "2026-10-18",
    });
    expect(prev.end).toBe("2026-09-30");
    expect(prev.start).toBe("2026-09-13");
  });
});
