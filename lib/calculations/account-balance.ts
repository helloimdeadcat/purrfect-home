import type { AdjustmentDirection, Money, TransactionType } from "@/types/database";

import {
  addMoney,
  formatMoney,
  parseMoney,
  zeroMoney,
  type MoneyInput,
} from "./money";

export type BalanceTransaction = {
  type: TransactionType;
  amount: MoneyInput;
  deleted_at?: string | null;
  adjustment_direction?: AdjustmentDirection | null;
};

export type BalanceTransfer = {
  from_account_id: string;
  to_account_id: string;
  amount: MoneyInput;
};

/**
 * Account balance is derived, never stored as source of truth:
 * initial + income + adjustment(increase) - expense - adjustment(decrease)
 * + transfers_in - transfers_out
 */
export function calculateAccountBalance(params: {
  accountId: string;
  initialBalance: MoneyInput;
  transactions: BalanceTransaction[];
  transfers: BalanceTransfer[];
}): Money {
  let minor = parseMoney(params.initialBalance);

  for (const tx of params.transactions) {
    if (tx.deleted_at) continue;
    const amount = parseMoney(tx.amount);

    switch (tx.type) {
      case "income":
        minor += amount;
        break;
      case "expense":
        minor -= amount;
        break;
      case "adjustment":
        // Legacy rows without direction are treated as increases (pre-migration).
        if (tx.adjustment_direction === "decrease") {
          minor -= amount;
        } else {
          minor += amount;
        }
        break;
      case "transfer":
        // Transfer rows on transactions are informational only; cash movement
        // is tracked via the transfers table to avoid double counting.
        break;
      default:
        break;
    }
  }

  for (const transfer of params.transfers) {
    const amount = parseMoney(transfer.amount);
    if (transfer.to_account_id === params.accountId) {
      minor += amount;
    }
    if (transfer.from_account_id === params.accountId) {
      minor -= amount;
    }
  }

  return formatMoney(minor);
}

export function sumBalances(balances: MoneyInput[]): Money {
  if (balances.length === 0) return zeroMoney();
  return addMoney(...balances);
}

export type CurrencyBalanceSummary = {
  baseCurrency: string;
  /** Sum of active account balances in the household base currency only */
  baseTotal: Money;
  /** Totals for other currencies (no FX conversion) */
  otherCurrencies: Array<{ currency: string; total: Money }>;
  /** Explicit: FX conversion is not implemented */
  fxConversionAvailable: false;
};

export function summarizeBalancesByCurrency(
  accounts: Array<{ currency: string; balance: MoneyInput; is_active: boolean }>,
  baseCurrency: string,
): CurrencyBalanceSummary {
  const totals = new Map<string, Money>();

  for (const account of accounts) {
    if (!account.is_active) continue;
    const current = totals.get(account.currency) ?? zeroMoney();
    totals.set(account.currency, addMoney(current, account.balance));
  }

  const baseTotal = totals.get(baseCurrency) ?? zeroMoney();
  const otherCurrencies = [...totals.entries()]
    .filter(([currency]) => currency !== baseCurrency)
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    baseCurrency,
    baseTotal,
    otherCurrencies,
    fxConversionAvailable: false,
  };
}
