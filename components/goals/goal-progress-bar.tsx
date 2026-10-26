import type { GoalStatus } from "@/lib/calculations/goal-progress";
import { cn } from "@/lib/utils";

type Props = {
  percentComplete: number;
  status: GoalStatus;
};

function barClass(status: GoalStatus): string {
  switch (status) {
    case "completed":
      return "bg-income-mark";
    case "archived":
      return "bg-muted-foreground/40";
    default:
      return "bg-primary";
  }
}

export function GoalProgressBar({ percentComplete, status }: Props) {
  const width = Math.min(Math.max(percentComplete, 0), 100);

  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={width}
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
