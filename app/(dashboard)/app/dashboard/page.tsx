import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cute/empty-state";
import { CatFace, Heart } from "@/components/cute/illustrations";
import { StatCard } from "@/components/cute/stat-card";
import { ForecastPanel } from "@/components/forecast/forecast-panel";
import { TodayCard } from "@/components/tasks/today-card";
import { QuickAddTransactionForm } from "@/components/forms/quick-add-transaction-form";
import { buttonVariants } from "@/components/ui/button";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { displayMoney, subtractMoney } from "@/lib/calculations/money";
import { forecastQuerySchema } from "@/lib/validations/forecast";
import { cn } from "@/lib/utils";
import { listHouseholdCategories } from "@/lib/data/categories";
import {
  listAccountsWithBalances,
  summarizeHouseholdWealth,
} from "@/services/account-service";
import { getForecastReport } from "@/services/forecast-service";
import { getHouseholdToday } from "@/services/settings-service";
import { loadTaskView } from "@/services/task-view-service";
import {
  listTransactions,
  monthlyIncomeExpense,
} from "@/services/transaction-service";

type Props = {
  searchParams: Promise<{
    horizon?: string;
    currency?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const forecastParsed = forecastQuerySchema.safeParse({
    horizon: params.horizon,
    currency: params.currency,
    from: params.from,
    to: params.to,
  });

  const { today } = await getHouseholdToday(supabase, ctx);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  const [accountsResult, monthResult, txResult, categoriesResult, forecastResult, taskViewResult] =
    await Promise.all([
      listAccountsWithBalances(supabase, ctx),
      monthlyIncomeExpense(supabase, ctx, year, month),
      listTransactions(supabase, ctx, { limit: 5 }),
      listHouseholdCategories(supabase, ctx.householdId),
      forecastParsed.success
        ? getForecastReport(supabase, ctx, forecastParsed.data)
        : Promise.resolve({ data: null, error: { code: "VALIDATION" as const, message: "Invalid forecast filters" } }),
      // Optional card: hidden (not an error banner) if tasks are unavailable,
      // e.g. before the tasks migration is applied.
      loadTaskView(supabase, ctx, { from: today, to: today }),
    ]);

  const accounts = accountsResult.data ?? [];
  const activeAccounts = accounts.filter((account) => account.is_active);
  const income = monthResult.data?.income ?? "0.00";
  const expense = monthResult.data?.expense ?? "0.00";
  const cashFlow = subtractMoney(income, expense);
  const otherMonthCurrencies = monthResult.data?.otherCurrencies ?? [];
  const wealth = summarizeHouseholdWealth(accounts, ctx.currency);
  const recent = txResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  // Never show 0.00 as if it were real when the data failed to load.
  const loadError = accountsResult.error ?? monthResult.error ?? null;

  return (
    <div className="flex flex-col gap-6">
      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          Some figures could not be loaded and may be incomplete:{" "}
          {loadError.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <CatFace className="size-14 shrink-0" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {ctx.displayName ? `Hi, ${ctx.displayName}` : "Hi there"}
              <Heart className="ml-1.5 inline size-5 -translate-y-0.5 text-primary" />
            </h1>
            <p className="text-muted-foreground">{ctx.householdName}</p>
          </div>
        </div>
        <Link
          href="/app/transactions"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          All transactions
        </Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Total (${wealth.baseCurrency})`}
          value={displayMoney(wealth.baseTotal, wealth.baseCurrency)}
        />
        <StatCard
          label="Income this month"
          value={displayMoney(income, ctx.currency)}
          tone="income"
        />
        <StatCard
          label="Expenses this month"
          value={displayMoney(expense, ctx.currency)}
          tone="expense"
        />
        <StatCard
          label="Cash flow"
          value={displayMoney(cashFlow, ctx.currency)}
        />
      </section>

      {wealth.otherCurrencies.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Other currencies (no FX conversion):{" "}
          {wealth.otherCurrencies
            .map(
              (entry) =>
                `${entry.currency} ${displayMoney(entry.total, entry.currency)}`,
            )
            .join(" · ")}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Totals use household base currency only. Currency conversion is not
          implemented.
        </p>
      )}

      {otherMonthCurrencies.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          This month in other currencies (not included above):{" "}
          {otherMonthCurrencies
            .map(
              (entry) =>
                `${entry.currency} +${displayMoney(entry.income, entry.currency)} / −${displayMoney(entry.expense, entry.currency)}`,
            )
            .join(" · ")}
        </p>
      ) : null}

      {taskViewResult.data ? <TodayCard view={taskViewResult.data} /> : null}

      {forecastResult.error ? (
        <p className="text-sm text-destructive" role="alert">
          Forecast unavailable: {forecastResult.error.message}
        </p>
      ) : forecastResult.data ? (
        <ForecastPanel
          report={forecastResult.data}
          basePath="/app/dashboard"
          compact
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Accounts</h2>
            <Link
              href="/app/accounts"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Manage
            </Link>
          </div>
          {activeAccounts.length === 0 ? (
            <EmptyState title="No accounts yet">
              Add your first account to start tracking money together.
            </EmptyState>
          ) : (
            activeAccounts.slice(0, 5).map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between card-soft px-4 py-3"
              >
                <div>
                  <p className="font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {account.type.replaceAll("_", " ")}
                  </p>
                </div>
                <p className="font-medium tabular-nums">
                  {displayMoney(account.balance, account.currency)}
                </p>
              </div>
            ))
          )}
        </section>

        <QuickAddTransactionForm
          accounts={accounts}
          categories={categories}
          defaultDate={today}
        />
      </div>

      <section className="grid gap-3">
        <h2 className="font-medium">Recent activity</h2>
        {recent.length === 0 ? (
          <EmptyState title="All quiet here">
            No transactions yet. Add your first one above.
          </EmptyState>
        ) : (
          recent.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between gap-3 card-soft px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {tx.merchant || tx.description || tx.type}
                </p>
                <p className="text-sm text-muted-foreground">
                  {tx.transaction_date} ·{" "}
                  {accountNameById.get(tx.account_id) ?? "Account"}
                </p>
              </div>
              <p
                className={`font-semibold tabular-nums ${
                  tx.type === "expense"
                    ? "text-expense"
                    : tx.type === "income"
                      ? "text-income"
                      : ""
                }`}
              >
                {tx.type === "expense" ? "−" : "+"}
                {displayMoney(tx.amount, tx.currency)}
              </p>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
