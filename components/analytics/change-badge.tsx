import type { PercentChangeResult } from "@/lib/calculations/analytics";

export function ChangeBadge({
  label,
  change,
}: {
  label: string;
  change: PercentChangeResult;
}) {
  let text = "n/a";
  if (change.kind === "equal_zero") text = "no change (both zero)";
  else if (change.kind === "from_zero") {
    text =
      change.direction === "up"
        ? "new activity vs zero prior"
        : "negative vs zero prior";
  } else {
    const sign = change.percent > 0 ? "+" : "";
    text = `${sign}${change.percent.toFixed(1)}% vs prior period`;
  }

  return (
    <p className="text-xs text-muted-foreground">
      {label}: {text}
    </p>
  );
}
