import type { PercentChangeResult } from "@/lib/calculations/analytics";
import { LOCALE } from "@/lib/locale";

const percentFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function ChangeBadge({
  label,
  change,
}: {
  label: string;
  change: PercentChangeResult;
}) {
  let text = "н/д";
  if (change.kind === "equal_zero") text = "без изменений (оба нуля)";
  else if (change.kind === "from_zero") {
    text =
      change.direction === "up"
        ? "рост с нуля"
        : "минус при нуле раньше";
  } else {
    const sign = change.percent > 0 ? "+" : "";
    text = `${sign}${percentFormat.format(change.percent)}% к прошлому периоду`;
  }

  return (
    <p className="text-xs text-muted-foreground">
      {label}: {text}
    </p>
  );
}
