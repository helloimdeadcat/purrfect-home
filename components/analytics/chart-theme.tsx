import type { CSSProperties, ReactNode } from "react";

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
