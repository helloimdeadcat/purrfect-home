import { describe, expect, it } from "vitest";

import {
  buildForecast,
  classifyForecastCandidate,
  type ForecastCandidateEvent,
} from "@/lib/calculations/forecast";
import { resolveForecastHorizon } from "@/lib/calculations/forecast-horizon";
import { todayInTimezone } from "@/lib/calculations/timezone-date";

const baseExpense = (
  overrides: Partial<ForecastCandidateEvent> = {},
): ForecastCandidateEvent => ({
  id: "occ:1",
  paymentId: "pay-1",
  date: "2026-10-20",
  name: "Rent",
  amount: "500.00",
  currency: "EUR",
  cashFlow: "expense",
  source: "occurrence",
  status: "pending",
  transactionId: null,
  ...overrides,
});

describe("resolveForecastHorizon", () => {
  it("resolves end of month, 7 days, and 30 days from today", () => {
    expect(
      resolveForecastHorizon("end_of_month", { today: "2026-10-18" }),
    ).toEqual({ start: "2026-10-18", end: "2026-10-31" });

    expect(
      resolveForecastHorizon("next_7_days", { today: "2026-10-18" }),
    ).toEqual({ start: "2026-10-18", end: "2026-10-24" });

    expect(
      resolveForecastHorizon("next_30_days", { today: "2026-10-18" }),
    ).toEqual({ start: "2026-10-18", end: "2026-11-16" });
  });

  it("caps a custom horizon from today even when `from` is late", () => {
    expect(() =>
      resolveForecastHorizon("custom", {
        today: "2026-10-18",
        from: "2027-08-14",
        to: "2028-06-09",
      }),
    ).toThrow(/cannot exceed/);
  });

  it("handles month/year boundaries and leap day", () => {
    expect(
      resolveForecastHorizon("end_of_month", { today: "2024-02-28" }),
    ).toEqual({ start: "2024-02-28", end: "2024-02-29" });

    expect(
      resolveForecastHorizon("next_7_days", { today: "2026-12-29" }),
    ).toEqual({ start: "2026-12-29", end: "2027-01-04" });
  });
});

describe("todayInTimezone", () => {
  it("returns a YYYY-MM-DD string for UTC and known zones", () => {
    const fixed = new Date("2026-10-18T22:30:00.000Z");
    expect(todayInTimezone("UTC", fixed)).toBe("2026-10-18");
    // Still evening UTC → next calendar day in Tokyo
    expect(todayInTimezone("Asia/Tokyo", fixed)).toBe("2026-10-19");
  });

  it("puts Berlin just after midnight on Nov 1 into November", () => {
    const fixed = new Date("2026-10-31T23:30:00.000Z");
    expect(todayInTimezone("Europe/Berlin", fixed)).toBe("2026-11-01");
    expect(todayInTimezone("America/New_York", fixed)).toBe("2026-10-31");
  });
});

describe("Safe-to-Spend reserve and optional payments", () => {
  it("subtracts the configured reserve per currency only", () => {
    const result = buildForecast({
      today: "2026-10-20",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "1000.00", USD: "300.00" },
      candidates: [baseExpense({ amount: "200.00" })],
      reserveByCurrency: { EUR: "250.00" },
    });
    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    const usd = result.byCurrency.find((c) => c.currency === "USD")!;
    expect(eur.safeToSpend).toBe("550.00");
    expect(eur.reserve).toBe("250.00");
    expect(usd.safeToSpend).toBe("300.00");
    expect(result.warnings.some((w) => w.includes("reserve is not configured"))).toBe(false);
  });

  it("optional expenses lower the forecast but not Safe-to-Spend", () => {
    const result = buildForecast({
      today: "2026-10-20",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "1000.00" },
      candidates: [
        baseExpense({ id: "occ:rent", amount: "500.00" }),
        baseExpense({ id: "occ:netflix", amount: "15.00", isMandatory: false }),
      ],
    });
    const eur = result.byCurrency[0];
    expect(eur.expectedExpense).toBe("515.00");
    expect(eur.forecastBalance).toBe("485.00");
    expect(eur.mandatoryOutflows).toBe("500.00");
    expect(eur.safeToSpend).toBe("500.00");
  });
});

describe("buildForecast chart", () => {
  it("ends the chart on forecastBalance when overdue items predate today", () => {
    const result = buildForecast({
      today: "2026-10-20",
      horizonEnd: "2026-10-25",
      balancesByCurrency: { EUR: "1000.00" },
      candidates: [
        baseExpense({ id: "occ:old", date: "2026-10-05", status: "overdue", amount: "200.00" }),
        baseExpense({ id: "occ:new", date: "2026-10-22", amount: "100.00" }),
      ],
    });
    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    const points = result.cashFlowByCurrency.EUR;
    expect(eur.forecastBalance).toBe("700.00");
    expect(points[0]).toMatchObject({ date: "2026-10-20", forecastBalance: "800.00" });
    expect(points.at(-1)?.forecastBalance).toBe(eur.forecastBalance);
  });
});

describe("classifyForecastCandidate", () => {
  it("excludes paid, skipped, and transaction-linked events", () => {
    expect(
      classifyForecastCandidate(
        baseExpense({ status: "paid", transactionId: "tx-1" }),
        "2026-10-18",
        "2026-10-31",
      ),
    ).toMatchObject({ include: false });

    expect(
      classifyForecastCandidate(
        baseExpense({ status: "skipped" }),
        "2026-10-18",
        "2026-10-31",
      ),
    ).toMatchObject({ include: false });
  });

  it("includes overdue pending expenses for Safe-to-Spend", () => {
    const verdict = classifyForecastCandidate(
      baseExpense({ date: "2026-10-10", status: "overdue" }),
      "2026-10-18",
      "2026-10-31",
    );
    expect(verdict).toEqual({
      include: true,
      countsTowardSafeToSpend: true,
    });
  });

  it("includes recurring income in forecast but not Safe-to-Spend", () => {
    const verdict = classifyForecastCandidate(
      baseExpense({
        id: "occ:inc",
        cashFlow: "income",
        name: "Salary",
        amount: "2000.00",
      }),
      "2026-10-18",
      "2026-10-31",
    );
    expect(verdict).toEqual({
      include: true,
      countsTowardSafeToSpend: false,
    });
  });

  it("excludes ambiguous past projected gaps", () => {
    expect(
      classifyForecastCandidate(
        baseExpense({
          source: "projected",
          status: "scheduled",
          date: "2026-10-01",
        }),
        "2026-10-18",
        "2026-10-31",
      ),
    ).toMatchObject({ include: false });
  });
});

describe("buildForecast", () => {
  it("keeps currencies separate and applies formulas", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "1000.00", USD: "200.00" },
      candidates: [
        baseExpense({ amount: "300.00", currency: "EUR", date: "2026-10-25" }),
        baseExpense({
          id: "occ:2",
          amount: "50.00",
          currency: "USD",
          date: "2026-10-20",
        }),
        baseExpense({
          id: "occ:3",
          cashFlow: "income",
          amount: "100.00",
          currency: "EUR",
          date: "2026-10-28",
          name: "Side gig",
        }),
      ],
      reserveByCurrency: {},
    });

    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    const usd = result.byCurrency.find((c) => c.currency === "USD")!;

    expect(eur.currentBalance).toBe("1000.00");
    expect(eur.expectedExpense).toBe("300.00");
    expect(eur.expectedIncome).toBe("100.00");
    // 1000 + 100 - 300 = 800
    expect(eur.forecastBalance).toBe("800.00");
    // STS ignores income: 1000 - 300 - 0 = 700
    expect(eur.safeToSpend).toBe("700.00");
    expect(eur.isDeficit).toBe(false);

    expect(usd.safeToSpend).toBe("150.00");
    expect(usd.forecastBalance).toBe("150.00");
  });

  it("does not double-count paid occurrences already in balance", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "700.00" },
      candidates: [
        baseExpense({
          status: "paid",
          transactionId: "tx-9",
          amount: "300.00",
        }),
        baseExpense({
          id: "proj:pay-1:2026-10-25",
          source: "projected",
          status: "scheduled",
          date: "2026-10-25",
          amount: "300.00",
        }),
      ],
    });

    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    expect(eur.mandatoryOutflows).toBe("300.00");
    expect(eur.safeToSpend).toBe("400.00");
    expect(result.excluded.some((e) => e.status === "paid")).toBe(true);
  });

  it("excludes skipped and does not invent transfers as cash flow", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "500.00" },
      candidates: [
        baseExpense({ status: "skipped", amount: "99.00" }),
      ],
    });
    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    expect(eur.expectedExpense).toBe("0.00");
    expect(eur.safeToSpend).toBe("500.00");
    expect(result.included).toHaveLength(0);
  });

  it("reports negative Safe-to-Spend as deficit without masking", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "100.00" },
      candidates: [baseExpense({ amount: "250.00" })],
      reserveByCurrency: { EUR: "0.00" },
    });
    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    expect(eur.safeToSpend).toBe("-150.00");
    expect(eur.isDeficit).toBe(true);
    expect(eur.deficitAmount).toBe("150.00");
  });

  it("treats missing reserve as zero", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "100.00" },
      candidates: [],
    });
    expect(result.byCurrency[0].reserve).toBe("0.00");
    expect(result.byCurrency[0].safeToSpend).toBe("100.00");
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("reserve")),
    ).toBe(true);
  });

  it("does not subtract budgets (budgets are outside this builder)", () => {
    // Documented contract: buildForecast has no budget parameter.
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "1000.00" },
      candidates: [baseExpense({ amount: "200.00" })],
    });
    expect(result.byCurrency[0].safeToSpend).toBe("800.00");
  });

  it("keeps actual balance separate from forecast income inflation of STS", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "100.00" },
      candidates: [
        baseExpense({
          cashFlow: "income",
          amount: "5000.00",
          name: "Unconfirmed bonus",
        }),
        baseExpense({
          id: "occ:exp",
          amount: "40.00",
          date: "2026-10-19",
        }),
      ],
    });
    const eur = result.byCurrency.find((c) => c.currency === "EUR")!;
    expect(eur.forecastBalance).toBe("5060.00");
    expect(eur.safeToSpend).toBe("60.00");
  });

  it("handles empty upcoming events", () => {
    const result = buildForecast({
      today: "2026-10-18",
      horizonEnd: "2026-10-31",
      balancesByCurrency: { EUR: "42.00" },
      candidates: [],
    });
    expect(result.included).toHaveLength(0);
    expect(result.byCurrency[0].forecastBalance).toBe("42.00");
    expect(result.cashFlowByCurrency.EUR.length).toBe(14);
  });
});
