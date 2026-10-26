import { redirect } from "next/navigation";

import { CreateAccountForm } from "@/components/forms/create-account-form";
import { CreateTransferForm } from "@/components/forms/create-transfer-form";
import { getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { displayMoney } from "@/lib/calculations/money";
import {
  listAccountsWithBalances,
  summarizeHouseholdWealth,
} from "@/services/account-service";
import { getHouseholdToday } from "@/services/settings-service";
import { EmptyState } from "@/components/cute/empty-state";

export default async function AccountsPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const [{ data: accounts, error: accountsError }, { today }] = await Promise.all([
    listAccountsWithBalances(supabase, ctx),
    getHouseholdToday(supabase, ctx),
  ]);
  const list = accounts ?? [];
  const wealth = summarizeHouseholdWealth(list, ctx.currency);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">
            Balances are calculated from transactions and transfers. FX
            conversion is not implemented.
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-medium">
            {wealth.baseCurrency}{" "}
            {displayMoney(wealth.baseTotal, wealth.baseCurrency)}
          </p>
          {wealth.otherCurrencies.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {wealth.otherCurrencies
                .map(
                  (entry) =>
                    `${entry.currency} ${displayMoney(entry.total, entry.currency)}`,
                )
                .join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {accountsError ? (
        <p className="text-sm text-destructive" role="alert">
          Balances could not be loaded: {accountsError.message}
        </p>
      ) : null}

      <section className="grid gap-3">
        {list.length === 0 && !accountsError ? (
          <EmptyState title="No accounts yet">Add a bank account, card or cash wallet below.</EmptyState>
        ) : (
          list.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-4 card-soft px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {account.name}
                  {!account.is_active ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      inactive
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground capitalize">
                  {account.type.replaceAll("_", " ")} · {account.currency}
                </p>
              </div>
              <p className="text-right font-medium tabular-nums">
                {displayMoney(account.balance, account.currency)}
              </p>
            </div>
          ))
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <CreateAccountForm defaultCurrency={ctx.currency} />
        <CreateTransferForm accounts={list} defaultDate={today} />
      </div>
    </div>
  );
}
