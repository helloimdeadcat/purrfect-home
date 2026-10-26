import type { BudgetUsageStatus } from "@/lib/calculations/budget-progress";
import { cn } from "@/lib/utils";

type Props = {
  percentUsed: number;
  status: BudgetUsageStatus;
};

function barClass(status: BudgetUsageStatus): string {
  switch (status) {
    case "over":
      return "bg-destructive";
    case "reached":
      return "bg-orange-500";
    case "warning":
      return "bg-amber-500";
    case "empty":
      return "bg-muted-foreground/30";
    default:
      return "bg-income-mark";
  }
}

export function BudgetProgressBar({ percentUsed, status }: Props) {
  const width = Math.min(Math.max(percentUsed, 0), 100);

  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.min(percentUsed, 999)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", barClass(status))}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
