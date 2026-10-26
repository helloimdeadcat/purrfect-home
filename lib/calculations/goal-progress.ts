import {
  compareMoney,
  formatMoney,
  parseMoney,
  subtractMoney,
  type MoneyInput,
  zeroMoney,
} from "@/lib/calculations/money";
import type { Money } from "@/types/database";

export type GoalStatus = "active" | "completed" | "archived";

export type GoalProgress = {
  target: Money;
  current: Money;
  remaining: Money;
  /** Display percent capped at 100 */
  percentComplete: number;
  /** Raw percent may exceed 100 if overfunded */
  percentRaw: number;
  status: GoalStatus;
  isOverfunded: boolean;
};

/**
 * Progress toward a savings goal. Display percent never exceeds 100;
 * remaining never goes negative.
 */
export function computeGoalProgress(
  target: MoneyInput,
  current: MoneyInput,
  options?: { isArchived?: boolean; isCompleted?: boolean },
): GoalProgress {
  const targetMoney = formatMoney(parseMoney(target));
  const currentMoney = formatMoney(parseMoney(current));
  const targetMinor = parseMoney(targetMoney);
  const currentMinor = parseMoney(currentMoney);

  if (targetMinor <= BigInt(0)) {
    throw new Error("Goal target must be greater than zero");
  }
  if (currentMinor < BigInt(0)) {
    throw new Error("Goal current amount cannot be negative");
  }

  const percentRaw = Number(
    (currentMinor * BigInt(100) + targetMinor / BigInt(2)) / targetMinor,
  );
  const percentComplete = Math.min(percentRaw, 100);
  const isOverfunded = compareMoney(currentMoney, targetMoney) > 0;
  const reached = compareMoney(currentMoney, targetMoney) >= 0;

  let status: GoalStatus = "active";
  if (options?.isArchived) {
    status = "archived";
  } else if (options?.isCompleted || reached) {
    status = "completed";
  }

  return {
    target: targetMoney,
    current: currentMoney,
    remaining: reached
      ? zeroMoney()
      : (subtractMoney(targetMoney, currentMoney) as Money),
    percentComplete,
    percentRaw,
    status,
    isOverfunded,
  };
}
