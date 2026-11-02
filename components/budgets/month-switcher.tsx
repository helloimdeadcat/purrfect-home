import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  formatYearMonth,
  monthLabel,
  shiftYearMonth,
} from "@/lib/calculations/budget-month";
import { cn } from "@/lib/utils";

type Props = {
  year: number;
  month: number;
};

export function MonthSwitcher({ year, month }: Props) {
  const prev = shiftYearMonth(year, month, -1);
  const next = shiftYearMonth(year, month, 1);

  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        href={`/app/budgets?month=${formatYearMonth(prev.year, prev.month)}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        ← Назад
      </Link>
      <p className="text-center font-medium">{monthLabel(year, month)}</p>
      <Link
        href={`/app/budgets?month=${formatYearMonth(next.year, next.month)}`}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Вперёд →
      </Link>
    </div>
  );
}
