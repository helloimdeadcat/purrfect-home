import {
  listMonthKeysInRange,
  monthKeyFromDate,
  type DateRange,
} from "@/lib/calculations/analytics-period";
import {
  addMoney,
  compareMoney,
  parseMoney,
  subtractMoney,
  zeroMoney,
  type MoneyInput,
} from "@/lib/calculations/money";
import type { Money } from "@/types/database";

export type AnalyticsTxn = {
  type: "income" | "expense";
  amount: MoneyInput;
  currency: string;
  transaction_date: string;
  category_id: string | null;
  income_source_id?: string | null;
  account_id?: string;
  deleted_at?: string | null;
};

export type MonthlyCashFlowPoint = {
  month: string;
  income: Money;
  expense: Money;
  net: Money;
};

export type CategoryAmount = {
  categoryId: string | null;
  categoryName: string;
  amount: Money;
};

export type CategoryComparisonRow = {
  categoryId: string | null;
  categoryName: string;
  current: Money;
  previous: Money;
  delta: Money;
};

export type PercentChangeResult =
  | { kind: "equal_zero" }
  | { kind: "from_zero"; direction: "up" | "down" }
  | { kind: "value"; percent: number };

/** Filter to factual income/expense rows in a single currency. */
export function filterAnalyticsTxns(
  rows: AnalyticsTxn[],
  options: {
    currency: string;
    range: DateRange;
    accountId?: string | null;
  },
): AnalyticsTxn[] {
  const currency = options.currency.toUpperCase();
  return rows.filter((row) => {
    if (row.deleted_at) return false;
    if (row.type !== "income" && row.type !== "expense") return false;
    if ((row.currency || "").toUpperCase() !== currency) return false;
    if (row.transaction_date < options.range.start) return false;
    if (row.transaction_date > options.range.end) return false;
    if (options.accountId && row.account_id !== options.accountId) return false;
    return true;
  });
}

export function sumIncomeExpense(rows: AnalyticsTxn[]): {
  income: Money;
  expense: Money;
  net: Money;
} {
  let income = zeroMoney();
  let expense = zeroMoney();
  for (const row of rows) {
    if (row.type === "income") income = addMoney(income, row.amount);
    else if (row.type === "expense") expense = addMoney(expense, row.amount);
  }
  return {
    income,
    expense,
    net: subtractMoney(income, expense) as Money,
  };
}

/**
 * Percent change without Infinity/NaN.
 * Zero previous → special kinds instead of dividing by zero.
 */
export function percentChangeMoney(
  current: MoneyInput,
  previous: MoneyInput,
): PercentChangeResult {
  const c = parseMoney(current);
  const p = parseMoney(previous);
  if (p === BigInt(0)) {
    if (c === BigInt(0)) return { kind: "equal_zero" };
    return { kind: "from_zero", direction: c > BigInt(0) ? "up" : "down" };
  }
  // Divide by |previous| so the sign always follows the direction of change:
  // net −100 → −50 is an improvement (+50%), not −50%.
  const base = p < BigInt(0) ? -p : p;
  const pct = Number(((c - p) * BigInt(10_000)) / base) / 100;
  return { kind: "value", percent: pct };
}

export function aggregateMonthlyCashFlow(
  rows: AnalyticsTxn[],
  range: DateRange,
): MonthlyCashFlowPoint[] {
  const keys = listMonthKeysInRange(range);
  const map = new Map<string, { income: Money; expense: Money }>();
  for (const key of keys) {
    map.set(key, { income: zeroMoney(), expense: zeroMoney() });
  }
  for (const row of rows) {
    const key = monthKeyFromDate(row.transaction_date);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (row.type === "income") {
      bucket.income = addMoney(bucket.income, row.amount);
    } else {
      bucket.expense = addMoney(bucket.expense, row.amount);
    }
  }
  return keys.map((month) => {
    const bucket = map.get(month)!;
    return {
      month,
      income: bucket.income,
      expense: bucket.expense,
      net: subtractMoney(bucket.income, bucket.expense) as Money,
    };
  });
}

export function aggregateByCategory(
  rows: AnalyticsTxn[],
  type: "income" | "expense",
  nameById: Map<string, string>,
): CategoryAmount[] {
  const totals = new Map<string | null, Money>();
  for (const row of rows) {
    if (row.type !== type) continue;
    const key = row.category_id;
    totals.set(key, addMoney(totals.get(key) ?? zeroMoney(), row.amount));
  }
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      categoryName: categoryId
        ? (nameById.get(categoryId) ?? "Неизвестная категория")
        : "Без категории",
      amount,
    }))
    .sort((a, b) => compareMoney(b.amount, a.amount));
}

export function aggregateByIncomeSource(
  rows: AnalyticsTxn[],
  nameById: Map<string, string>,
): { sourceId: string | null; sourceName: string; amount: Money }[] {
  const totals = new Map<string | null, Money>();
  for (const row of rows) {
    if (row.type !== "income") continue;
    const key = row.income_source_id ?? null;
    totals.set(key, addMoney(totals.get(key) ?? zeroMoney(), row.amount));
  }
  return [...totals.entries()]
    .map(([sourceId, amount]) => ({
      sourceId,
      sourceName: sourceId
        ? (nameById.get(sourceId) ?? "Неизвестный источник")
        : "Без источника",
      amount,
    }))
    .sort((a, b) => compareMoney(b.amount, a.amount));
}

export function compareCategoryExpenses(
  currentRows: AnalyticsTxn[],
  previousRows: AnalyticsTxn[],
  nameById: Map<string, string>,
): CategoryComparisonRow[] {
  const current = new Map(
    aggregateByCategory(currentRows, "expense", nameById).map((row) => [
      row.categoryId,
      row,
    ]),
  );
  const previous = new Map(
    aggregateByCategory(previousRows, "expense", nameById).map((row) => [
      row.categoryId,
      row,
    ]),
  );
  const ids = new Set([...current.keys(), ...previous.keys()]);
  return [...ids]
    .map((categoryId) => {
      const cur = current.get(categoryId)?.amount ?? zeroMoney();
      const prev = previous.get(categoryId)?.amount ?? zeroMoney();
      return {
        categoryId,
        categoryName:
          current.get(categoryId)?.categoryName ??
          previous.get(categoryId)?.categoryName ??
          "Без категории",
        current: cur,
        previous: prev,
        delta: subtractMoney(cur, prev) as Money,
      };
    })
    .sort((a, b) => compareMoney(b.current, a.current));
}

export function collectCurrencies(rows: { currency: string }[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => (row.currency || "").toUpperCase())
        .filter((value) => value.length === 3),
    ),
  ].sort();
}
