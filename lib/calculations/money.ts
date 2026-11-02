import { LOCALE } from "@/lib/locale";
import type { Money } from "@/types/database";

const SCALE = BigInt(100); // numeric(15,2) — minor units (cents)

export type MoneyInput = string | number | Money | null | undefined;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/**
 * Coerce Supabase numeric / form values into a parseable string.
 * PostgREST may return numeric columns as numbers depending on client/settings.
 */
function coerceMoneyString(value: MoneyInput): string {
  if (value == null) {
    return "0.00";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new MoneyError(`Invalid money amount: ${value}`);
    }
    // numeric(15,2) values arriving as JS numbers — normalize to 2 decimals
    return value.toFixed(2);
  }
  if (typeof value === "string") {
    return value;
  }
  throw new MoneyError(`Invalid money amount type: ${typeof value}`);
}

/**
 * Parse a money value into integer minor units (cents).
 * Accepts "12", "12.3", "12.34", and numeric JS numbers from Supabase.
 */
export function parseMoney(value: MoneyInput): bigint {
  const normalized = coerceMoneyString(value).trim().replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new MoneyError(`Invalid money amount: ${String(value)}`);
  }

  const negative = normalized.startsWith("-");
  const absolute = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = absolute.split(".");
  const whole = BigInt(wholePart);
  const fraction = BigInt(fractionPart.padEnd(2, "0"));
  const minor = whole * SCALE + fraction;
  return negative ? -minor : minor;
}

export function formatMoney(minorUnits: bigint): Money {
  const negative = minorUnits < BigInt(0);
  const absolute = negative ? -minorUnits : minorUnits;
  const whole = absolute / SCALE;
  const fraction = absolute % SCALE;
  const formatted = `${whole.toString()}.${fraction.toString().padStart(2, "0")}`;
  return (negative ? `-${formatted}` : formatted) as Money;
}

export function zeroMoney(): Money {
  return "0.00";
}

export function addMoney(...values: MoneyInput[]): Money {
  const total = values.reduce(
    (sum, value) => sum + parseMoney(value),
    BigInt(0),
  );
  return formatMoney(total);
}

export function subtractMoney(left: MoneyInput, right: MoneyInput): Money {
  return formatMoney(parseMoney(left) - parseMoney(right));
}

export function negateMoney(value: MoneyInput): Money {
  return formatMoney(-parseMoney(value));
}

export function compareMoney(left: MoneyInput, right: MoneyInput): number {
  const diff = parseMoney(left) - parseMoney(right);
  if (diff < BigInt(0)) return -1;
  if (diff > BigInt(0)) return 1;
  return 0;
}

export function isPositiveMoney(value: MoneyInput): boolean {
  return parseMoney(value) > BigInt(0);
}

export function displayMoney(value: MoneyInput, currency = "EUR"): string {
  const minor = parseMoney(value);
  const amount = Number(minor) / Number(SCALE);
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${formatMoney(minor)} ${currency}`;
  }
}

/** Normalize user input to canonical Money string with 2 decimals. */
export function normalizeMoneyInput(value: string | number): Money {
  return formatMoney(parseMoney(value));
}

/** Ensure DB/API values are always Money strings in app code. */
export function asMoney(value: MoneyInput): Money {
  return formatMoney(parseMoney(value));
}
