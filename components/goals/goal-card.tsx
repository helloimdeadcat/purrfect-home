import { GoalActions } from "@/components/goals/goal-actions";
import { GoalHistory } from "@/components/goals/goal-history";
import { GoalProgressBar } from "@/components/goals/goal-progress-bar";
import { displayMoney } from "@/lib/calculations/money";
import { LOCALE } from "@/lib/locale";
import type { GoalWithProgress } from "@/services/goal-service";

type Props = {
  goal: GoalWithProgress;
  canManage: boolean;
  canDelete: boolean;
};

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dateFormat.format(date);
}

function statusLabel(goal: GoalWithProgress): string {
  if (goal.progress.status === "archived") return "В архиве";
  if (goal.progress.status === "completed") {
    return goal.progress.isOverfunded ? "Достигнута (с запасом) 🎉" : "Достигнута 🎉";
  }
  return "Копим";
}

export function GoalCard({ goal, canManage, canDelete }: Props) {
  const { progress } = goal;

  return (
    <div className="grid gap-3 card-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{goal.name}</p>
          <p className="text-sm text-muted-foreground">
            {statusLabel(goal)}
            {goal.target_date ? ` · до ${formatDate(goal.target_date)}` : ""}
          </p>
          {goal.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums">
          {progress.percentComplete}%
        </p>
      </div>

      <GoalProgressBar
        percentComplete={progress.percentComplete}
        status={progress.status}
      />

      <div className="grid grid-cols-3 gap-2 text-sm [&>div]:min-w-0 [&_p]:break-words">
        <div>
          <p className="text-muted-foreground">Накоплено</p>
          <p className="font-medium tabular-nums">
            {displayMoney(progress.current, goal.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Цель</p>
          <p className="font-medium tabular-nums">
            {displayMoney(progress.target, goal.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Осталось</p>
          <p className="font-medium tabular-nums">
            {displayMoney(progress.remaining, goal.currency)}
          </p>
        </div>
      </div>

      <GoalActions goal={goal} canManage={canManage} canDelete={canDelete} />
      <GoalHistory goalId={goal.id} currency={goal.currency} />
    </div>
  );
}
