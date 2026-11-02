import type { Macros, NutritionTarget } from "@/lib/calculations/nutrition";
import { rangeStatus } from "@/lib/calculations/nutrition";
import { WEIGH_LABEL } from "@/lib/meals/labels";
import { cn } from "@/lib/utils";
import type { WeighMode } from "@/types/database";

/** Small "С / Р / У …" badge with the full meaning as a tooltip. */
export function WeighBadge({ mode }: { mode: WeighMode | null }) {
  if (!mode) return null;
  const label = WEIGH_LABEL[mode];
  return (
    <abbr
      title={label.text}
      className="ml-1 rounded-md bg-muted px-1 text-[10px] font-semibold text-muted-foreground no-underline"
    >
      {label.code}
    </abbr>
  );
}

export function macroLine(m: Macros | undefined): string {
  if (!m) return "—";
  return `${Math.round(m.kcal)} ккал · Б ${Math.round(m.protein)} / Ж ${Math.round(m.fat)} / У ${Math.round(m.carbs)}`;
}

const STATUS_TEXT = { below: "мало", within: "в норме", above: "много", none: "" } as const;

/**
 * One person's day vs their targets: a kcal bar plus protein/fat range chips.
 * Status is spelled out in text, never colour alone.
 */
export function DaySummary({
  label,
  color,
  totals,
  target,
}: {
  label: string;
  color: string;
  totals: Macros | undefined;
  target: NutritionTarget | undefined;
}) {
  const kcal = Math.round(totals?.kcal ?? 0);
  const goal = target?.kcal ?? null;
  const pct = goal ? Math.min(100, Math.round((kcal / goal) * 100)) : 0;
  const protein = Math.round(totals?.protein ?? 0);
  const fat = Math.round(totals?.fat ?? 0);
  const proteinStatus = rangeStatus(protein, target?.proteinMin ?? null, target?.proteinMax ?? null);
  const fatStatus = rangeStatus(fat, target?.fatMin ?? null, target?.fatMax ?? null);

  return (
    <div className="grid gap-2 rounded-xl bg-muted/40 p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="tabular-nums">
          <span className="text-lg font-semibold">{kcal}</span>
          {goal ? <span className="text-muted-foreground"> / {goal} ккал</span> : " ккал"}
        </span>
      </div>
      {goal ? (
        <div
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${label}: ${kcal} из ${goal} ккал`}
          aria-valuenow={kcal}
          aria-valuemin={0}
          aria-valuemax={goal}
        >
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {[
          { name: "Белки", value: protein, status: proteinStatus, min: target?.proteinMin, max: target?.proteinMax },
          { name: "Жиры", value: fat, status: fatStatus, min: target?.fatMin, max: target?.fatMax },
        ].map((chip) => (
          <span
            key={chip.name}
            className={cn(
              "rounded-full border px-2 py-0.5",
              chip.status === "within" && "border-income/40 bg-accent text-accent-foreground",
              (chip.status === "below" || chip.status === "above") && "border-border bg-card",
            )}
          >
            {chip.name} {chip.value} г
            {chip.min != null || chip.max != null ? ` (${chip.min ?? "–"}–${chip.max ?? "–"})` : ""}
            {chip.status !== "none" ? ` · ${STATUS_TEXT[chip.status]}` : ""}
          </span>
        ))}
        <span className="rounded-full border border-border bg-card px-2 py-0.5">
          Углеводы {Math.round(totals?.carbs ?? 0)} г
        </span>
        <span className="rounded-full border border-border bg-card px-2 py-0.5">
          Клетчатка ≈{Math.round(totals?.fiber ?? 0)} г
        </span>
      </div>
    </div>
  );
}
