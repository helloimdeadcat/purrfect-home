import {
  compareMoney,
  formatMoney,
  parseMoney,
  subtractMoney,
  type MoneyInput,
  zeroMoney,
} from "@/lib/calculations/money";
import type { Money } from "@/types/database";

export type BudgetUsageStatus =
  | "empty"
  | "under"
  | "warning"
  | "reached"
  | "over";

export type BudgetProgress = {
  limit: Money;
  spent: Money;
  remaining: Money;
  /** 0–100+ ; over 100 when over budget */
  percentUsed: number;
  status: BudgetUsageStatus;
};

const WARNING_THRESHOLD = 80;

/**
 * Compute budget progress from limit and spent amounts (same currency).
 * spent must already exclude transfers and soft-deleted transactions.
 */
export function computeBudgetProgress(
  limit: MoneyInput,
  spent: MoneyInput,
): BudgetProgress {
  const limitMoney = formatMoney(parseMoney(limit));
  const spentMoney = formatMoney(parseMoney(spent));
  const limitMinor = parseMoney(limitMoney);
  const spentMinor = parseMoney(spentMoney);

  if (limitMinor < BigInt(0) || spentMinor < BigInt(0)) {
    throw new Error("Budget limit and spent must be non-negative");
  }

  let percentUsed = 0;
  if (limitMinor === BigInt(0)) {
    percentUsed = spentMinor > BigInt(0) ? 100 : 0;
  } else {
    // integer percent, rounded; can exceed 100
    percentUsed = Number(
      (spentMinor * BigInt(100) + limitMinor / BigInt(2)) / limitMinor,
    );
  }

  let status: BudgetUsageStatus;
  if (spentMinor === BigInt(0)) {
    status = "empty";
  } else if (compareMoney(spentMoney, limitMoney) > 0) {
    status = "over";
  } else if (compareMoney(spentMoney, limitMoney) === 0) {
    status = "reached";
  } else if (percentUsed >= WARNING_THRESHOLD) {
    status = "warning";
  } else {
    status = "under";
  }

  return {
    limit: limitMoney,
    spent: spentMoney,
    remaining:
      status === "over"
        ? zeroMoney()
        : (subtractMoney(limitMoney, spentMoney) as Money),
    percentUsed,
    status,
  };
}

export function overspentAmount(limit: MoneyInput, spent: MoneyInput): Money {
  const diff = parseMoney(spent) - parseMoney(limit);
  return diff > BigInt(0) ? formatMoney(diff) : zeroMoney();
}
