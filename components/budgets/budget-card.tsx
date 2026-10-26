import { BudgetProgressBar } from "@/components/budgets/budget-progress-bar";
import { DeleteBudgetButton } from "@/components/budgets/delete-budget-button";
import { EditBudgetForm } from "@/components/budgets/edit-budget-form";
import { displayMoney } from "@/lib/calculations/money";
import type { BudgetWithProgress } from "@/services/budget-service";

type Props = {
  budget: BudgetWithProgress;
  canManage: boolean;
};

function statusLabel(budget: BudgetWithProgress): string {
  switch (budget.progress.status) {
    case "empty":
      return "No spending yet";
    case "under":
      return "On track";
    case "warning":
      return "Approaching limit";
    case "reached":
      return "Limit reached";
    case "over":
      return `Over by ${displayMoney(budget.overspent, budget.currency)}`;
    default:
      return "";
  }
}

export function BudgetCard({ budget, canManage }: Props) {
  const { progress } = budget;

  return (
    <div className="grid gap-3 card-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {budget.categoryName ?? budget.name}
          </p>
          <p className="text-sm text-muted-foreground">{statusLabel(budget)}</p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <EditBudgetForm
              budgetId={budget.id}
              currentAmount={budget.amount}
              currency={budget.currency}
            />
            <DeleteBudgetButton budgetId={budget.id} />
          </div>
        ) : null}
      </div>

      <BudgetProgressBar
        percentUsed={progress.percentUsed}
        status={progress.status}
      />

      <div className="grid grid-cols-3 gap-2 text-sm [&>div]:min-w-0 [&_p]:break-words">
        <div>
          <p className="text-muted-foreground">Spent</p>
          <p className="font-medium tabular-nums">
            {displayMoney(progress.spent, budget.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Limit</p>
          <p className="font-medium tabular-nums">
            {displayMoney(progress.limit, budget.currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Left</p>
          <p className="font-medium tabular-nums">
            {displayMoney(progress.remaining, budget.currency)}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {Math.min(progress.percentUsed, 999)}% used
        {budget.spentOtherCurrencies.length > 0
          ? ` · Also spent outside ${budget.currency}: ${budget.spentOtherCurrencies
              .map((entry) => displayMoney(entry.amount, entry.currency))
              .join(", ")} (not counted toward this limit — FX not implemented)`
          : ""}
      </p>
    </div>
  );
}
