import { describe, expect, it } from "vitest";

import { buildCalendarEvents } from "./calendar-service";

const rent = {
  id: "pay-rent",
  household_id: "hh",
  name: "Rent",
  type: "expense" as const,
  amount: "1000.00",
  currency: "EUR",
  category_id: "cat",
  account_id: "acc",
  frequency: "monthly" as const,
  interval_days: null,
  day_of_month: 1,
  weekday: null,
  start_date: "2026-01-01",
  end_date: null,
  next_due_date: "2026-11-01",
  description: null,
  is_active: true,
  is_archived: false,
  auto_create: false,
  is_mandatory: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function occurrence(
  id: string,
  date: string,
  status: "pending" | "paid" | "skipped" | "overdue",
  transactionId: string | null = null,
) {
  return {
    id,
    recurring_payment_id: rent.id,
    household_id: "hh",
    scheduled_date: date,
    transaction_id: transactionId,
    status,
    amount: "1000.00",
    notes: null,
    processed_at: null,
    processed_by: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function actualTotals(events: ReturnType<typeof buildCalendarEvents>) {
  const totals: Record<string, string[]> = {};
  for (const event of events) {
    if (!event.isActual) continue;
    (totals[event.currency] ??= []).push(event.amount);
  }
  return totals;
}

describe("buildCalendarEvents actuals", () => {
  it("counts a confirmed recurring payment once — via its transaction", () => {
    const events = buildCalendarEvents({
      payments: [rent],
      occurrences: [occurrence("occ-oct", "2026-10-01", "paid", "tx-rent")],
      transactions: [
        {
          id: "tx-rent",
          type: "expense",
          amount: "1000.00",
          currency: "EUR",
          transaction_date: "2026-10-01",
          description: "Rent",
          merchant: null,
        },
      ],
      today: "2026-10-20",
      rangeStart: "2026-10-01",
      rangeEnd: "2026-10-31",
      fallbackCurrency: "EUR",
    });

    expect(actualTotals(events)).toEqual({ EUR: ["1000.00"] });
    const occ = events.find((e) => e.id === "occ:occ-oct");
    expect(occ?.status).toBe("paid");
    expect(occ?.isActual).toBe(false);
  });

  it("never treats projected, pending or overdue recurring as actual", () => {
    const events = buildCalendarEvents({
      payments: [rent],
      occurrences: [occurrence("occ-oct", "2026-10-01", "pending")],
      transactions: [],
      today: "2026-10-20",
      rangeStart: "2026-10-01",
      rangeEnd: "2026-11-30",
      fallbackCurrency: "EUR",
    });

    expect(actualTotals(events)).toEqual({});
    expect(events.find((e) => e.id === "occ:occ-oct")?.status).toBe("overdue");
    // Nov 1 is projected, Oct 1 is not re-projected over its occurrence.
    expect(events.map((e) => e.id)).toEqual([
      "occ:occ-oct",
      "proj:pay-rent:2026-11-01",
    ]);
  });

  it("keeps currencies apart and ignores non income/expense rows", () => {
    const events = buildCalendarEvents({
      payments: [],
      occurrences: [],
      transactions: [
        {
          id: "a",
          type: "expense",
          amount: "10.00",
          currency: "EUR",
          transaction_date: "2026-10-02",
          description: null,
          merchant: null,
        },
        {
          id: "b",
          type: "expense",
          amount: "5.00",
          currency: "USD",
          transaction_date: "2026-10-03",
          description: null,
          merchant: null,
        },
        {
          id: "c",
          type: "adjustment",
          amount: "99.00",
          currency: "EUR",
          transaction_date: "2026-10-04",
          description: null,
          merchant: null,
        },
      ],
      today: "2026-10-20",
      rangeStart: "2026-10-01",
      rangeEnd: "2026-10-31",
      fallbackCurrency: "EUR",
    });

    expect(actualTotals(events)).toEqual({ EUR: ["10.00"], USD: ["5.00"] });
  });
});
