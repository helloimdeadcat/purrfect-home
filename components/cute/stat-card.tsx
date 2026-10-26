import type { ReactNode } from "react";

import { Heart, PawPrint } from "@/components/cute/illustrations";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "income" | "expense";

const TONE: Record<Tone, { value: string; chip: string; icon: ReactNode }> = {
  neutral: {
    value: "text-foreground",
    chip: "bg-secondary text-primary",
    icon: <Heart className="size-3.5" />,
  },
  income: {
    value: "text-income",
    chip: "bg-accent text-income",
    icon: <PawPrint className="size-3.5" />,
  },
  expense: {
    value: "text-expense",
    chip: "bg-secondary text-expense",
    icon: <PawPrint className="size-3.5 rotate-180" />,
  },
};

/**
 * Headline number tile. Tone colours only the value and a small icon chip —
 * the label stays in muted ink so colour is never the sole carrier of meaning.
 */
export function StatCard({
  label,
  value,
  tone = "neutral",
  footer,
}: {
  label: string;
  value: string;
  tone?: Tone;
  footer?: ReactNode;
}) {
  const style = TONE[tone];
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2">
        <span className={cn("grid size-6 place-items-center rounded-full", style.chip)}>
          {style.icon}
        </span>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tracking-tight tabular-nums",
          style.value,
        )}
      >
        {value}
      </p>
      {footer ? <div className="mt-1">{footer}</div> : null}
    </div>
  );
}
