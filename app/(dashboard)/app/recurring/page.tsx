import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateRecurringForm } from "@/components/recurring/create-recurring-form";
import { DueOccurrenceActions } from "@/components/recurring/due-occurrence-actions";
import { RecurringPaymentCard } from "@/components/recurring/recurring-payment-card";
import { buttonVariants } from "@/components/ui/button";
import {
  canAdmin,
  canWrite,
  getHouseholdContext,
} from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { listHouseholdCategories } from "@/lib/data/categories";
import { cn } from "@/lib/utils";
import { listAccountsWithBalances } from "@/services/account-service";
import {
  listDueOccurrences,
  listRecurringPayments,
} from "@/services/recurring-service";
import { EmptyState } from "@/components/cute/empty-state";

type Props = {
  searchParams: Promise<{
    archived?: string;
    type?: string;
    status?: string;
  }>;
};

export default async function RecurringPage({ searchParams }: Props) {
  const params = await searchParams;
  const includeArchived = params.archived === "1";
  const typeFilter = params.type === "income" || params.type === "expense"
    ? params.type
    : null;
  const statusFilter = params.status ?? null;

  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const manage = canWrite(ctx.role);
  const canDelete = canAdmin(ctx.role);

  const [paymentsResult, dueResult, accountsResult, categoriesResult] =
    await Promise.all([
      listRecurringPayments(supabase, ctx, { includeArchived }),
      listDueOccurrences(supabase, ctx),
      listAccountsWithBalances(supabase, ctx),
      listHouseholdCategories(supabase, ctx.householdId),
    ]);

  const loadError =
    paymentsResult.error?.message ??
    dueResult.error?.message ??
    accountsResult.error?.message ??
    categoriesResult.error ??
    null;

  let payments = paymentsResult.data ?? [];
  if (typeFilter) {
    payments = payments.filter((payment) => payment.type === typeFilter);
  }
  if (statusFilter === "active") {
    payments = payments.filter((payment) => payment.displayStatus === "active");
  } else if (statusFilter === "paused") {
    payments = payments.filter((payment) => payment.displayStatus === "paused");
  }

  const due = dueResult.data ?? [];
  const overdue = due.filter((item) => item.effectiveStatus === "overdue");
  const upcoming = due.filter((item) => item.effectiveStatus === "pending");

  const accounts = (accountsResult.data ?? [])
    .filter((account) => account.is_active)
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    }));

  const categories = categoriesResult.data ?? [];

  function href(overrides: Record<string, string | null>) {
    const next = new URLSearchParams();
    const merged = {
      archived: includeArchived ? "1" : null,
      type: typeFilter,
      status: statusFilter,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/app/recurring?${qs}` : "/app/recurring";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recurring</h1>
        <p className="text-muted-foreground">
          Templates for regular income and expenses in {ctx.householdName}.
          Confirm due items to create real transactions — nothing posts
          automatically.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href={href({ type: null })}
          className={cn(
            buttonVariants({
              variant: typeFilter ? "outline" : "default",
              size: "sm",
            }),
          )}
        >
          All types
        </Link>
        <Link
          href={href({ type: "expense" })}
          className={cn(
            buttonVariants({
              variant: typeFilter === "expense" ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          Expenses
        </Link>
        <Link
          href={href({ type: "income" })}
          className={cn(
            buttonVariants({
              variant: typeFilter === "income" ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          Income
        </Link>
        <Link
          href={href({ status: statusFilter === "active" ? null : "active" })}
          className={cn(
            buttonVariants({
              variant: statusFilter === "active" ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          Active
        </Link>
        <Link
          href={href({ status: statusFilter === "paused" ? null : "paused" })}
          className={cn(
            buttonVariants({
              variant: statusFilter === "paused" ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          Paused
        </Link>
        <Link
          href={href({ archived: includeArchived ? null : "1" })}
          className={cn(
            buttonVariants({
              variant: includeArchived ? "default" : "outline",
              size: "sm",
            }),
          )}
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <section className="grid gap-3">
        <h2 className="font-medium">Due now</h2>
        {overdue.length === 0 && upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing due today. Upcoming payments stay as templates until you
            confirm them.
          </p>
        ) : (
          <>
            {overdue.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium text-destructive">Overdue</p>
                {overdue.map((occurrence) =>
                  manage ? (
                    <DueOccurrenceActions
                      key={occurrence.id}
                      occurrence={occurrence}
                    />
                  ) : (
                    <p key={occurrence.id} className="text-sm">
                      {occurrence.paymentName} · {occurrence.scheduled_date}
                    </p>
                  ),
                )}
              </div>
            ) : null}
            {upcoming.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Due today</p>
                {upcoming.map((occurrence) =>
                  manage ? (
                    <DueOccurrenceActions
                      key={occurrence.id}
                      occurrence={occurrence}
                    />
                  ) : (
                    <p key={occurrence.id} className="text-sm">
                      {occurrence.paymentName} · {occurrence.scheduled_date}
                    </p>
                  ),
                )}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-medium">Templates</h2>
        {payments.length === 0 ? (
          <EmptyState title="No recurring payments yet">Add rent, subscriptions or salary so nothing sneaks up on you.</EmptyState>
        ) : (
          payments.map((payment) => (
            <RecurringPaymentCard
              key={payment.id}
              payment={payment}
              accounts={accounts}
              categories={categories}
              canManage={manage}
              canDelete={canDelete}
            />
          ))
        )}
      </section>

      {manage ? (
        <CreateRecurringForm
          accounts={accounts}
          categories={categories}
          defaultCurrency={ctx.currency}
        />
      ) : null}
    </div>
  );
}
