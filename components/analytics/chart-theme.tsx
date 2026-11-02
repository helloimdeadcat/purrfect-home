import type { CSSProperties, ReactNode } from "react";

import { LOCALE } from "@/lib/locale";

/**
 * Shared Recharts styling. Legend and tooltip text wear text tokens, never
 * the series colour — the coloured swatch beside the text carries identity.
 */
export function legendText(value: ReactNode): ReactNode {
  return <span style={{ color: "var(--foreground)" }}>{value}</span>;
}

export const tooltipContentStyle: CSSProperties = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "0 6px 18px -10px rgb(201 61 120 / 35%)",
  fontSize: 13,
};

export const tooltipLabelStyle: CSSProperties = {
  color: "var(--muted-foreground)",
  fontWeight: 600,
};

export const axisTick = { fontSize: 12, fill: "var(--muted-foreground)" };

const numberTickFormat = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

/** Y-axis amounts in the UI locale (no currency, no decimals). */
export function numberTick(value: number | string): string {
  return numberTickFormat.format(Number(value));
}

function monthDate(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

const monthShortFormat = new Intl.DateTimeFormat(LOCALE, {
  month: "short",
  timeZone: "UTC",
});
const monthLongFormat = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-10" → "окт." for axis ticks. */
export function monthTick(key: string): string {
  const date = monthDate(key);
  return date ? monthShortFormat.format(date) : String(key);
}

/** "2026-10" → "октябрь 2026 г." for tooltips and screen readers. */
export function monthLabel(key: string): string {
  const date = monthDate(key);
  return date ? monthLongFormat.format(date) : String(key);
}
