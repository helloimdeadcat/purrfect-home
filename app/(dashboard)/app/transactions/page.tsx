import { redirect } from "next/navigation";

import { EmptyState } from "@/components/cute/empty-state";
import { QuickAddTransactionForm } from "@/components/forms/quick-add-transaction-form";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import { ExportTransactionsForm } from "@/components/transactions/export-transactions-form";
import { TransactionReceipts } from "@/components/transactions/transaction-receipts";
import { canAdmin, canWrite, getHouseholdContext } from "@/lib/auth/household";
import { getSessionUser } from "@/lib/auth/session";
import { displayMoney } from "@/lib/calculations/money";
import { listHouseholdCategories } from "@/lib/data/categories";
import { listAccounts } from "@/services/account-service";
import { listIncomeSources } from "@/services/income-source-service";
import { listReceiptsForTransactions } from "@/services/receipt-service";
import { getHouseholdToday } from "@/services/settings-service";
import { listTags } from "@/services/tag-service";
import { listTransactions } from "@/services/transaction-service";
import { LOCALE } from "@/lib/locale";

const TX_TYPE_LABELS: Record<string, string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  adjustment: "Корректировка",
};

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? isoDate : dayFormat.format(date);
}

export default async function TransactionsPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const { data: ctx } = await getHouseholdContext(supabase, user);
  if (!ctx) redirect("/login");

  const [
    accountsResult,
    categoriesResult,
    transactionsResult,
    tagsResult,
    sourcesResult,
  ] = await Promise.all([
    listAccounts(supabase, ctx),
    listHouseholdCategories(supabase, ctx.householdId),
    listTransactions(supabase, ctx, { limit: 50 }),
    listTags(supabase, ctx),
    listIncomeSources(supabase, ctx),
  ]);

  const accounts = accountsResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const transactions = transactionsResult.data ?? [];
  const [receiptsResult, { today }] = await Promise.all([
    listReceiptsForTransactions(
      supabase,
      ctx,
      transactions.map((tx) => tx.id),
    ),
    getHouseholdToday(supabase, ctx),
  ]);
  const receiptsByTransaction = receiptsResult.data ?? new Map();
  const mayAttach = (createdBy: string) =>
    canAdmin(ctx.role) || (canWrite(ctx.role) && createdBy === ctx.user.id);
  const tags = tagsResult.data ?? [];
  const incomeSources = sourcesResult.data ?? [];
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const sourceNameById = new Map(incomeSources.map((s) => [s.id, s.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Операции</h1>
        <p className="text-muted-foreground">
          Быстро записывай повседневные доходы и расходы.
        </p>
      </div>

      <QuickAddTransactionForm
        accounts={accounts}
        categories={categories}
        defaultDate={today}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        incomeSources={incomeSources.map((source) => ({
          id: source.id,
          name: source.name,
        }))}
      />

      <ExportTransactionsForm
        defaultFrom={`${today.slice(0, 7)}-01`}
        defaultTo={today}
        currencies={[...new Set(accounts.map((a) => a.currency.toUpperCase()))].sort()}
      />

      <section className="grid gap-2">
        <h2 className="font-medium">Последние</h2>
        {transactions.length === 0 ? (
          <EmptyState title="Пока нет операций">
            Добавь первый доход или расход через форму выше.
          </EmptyState>
        ) : (
          transactions.map((tx) => (
            <div
              key={tx.id}
              className="grid gap-2 card-soft px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {tx.merchant || tx.description || TX_TYPE_LABELS[tx.type] || tx.type}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDay(tx.transaction_date)} ·{" "}
                    {accountNameById.get(tx.account_id) ?? "Счёт"}
                    {tx.category_id
                      ? ` · ${categoryNameById.get(tx.category_id) ?? "Категория"}`
                      : ""}
                    {tx.income_source_id
                      ? ` · ${sourceNameById.get(tx.income_source_id) ?? "Источник"}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p
                    className={`font-medium tabular-nums ${
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
                  <DeleteTransactionButton transactionId={tx.id} />
                </div>
              </div>
              <TransactionReceipts
                transactionId={tx.id}
                receipts={receiptsByTransaction.get(tx.id) ?? []}
                canUpload={mayAttach(tx.created_by)}
              />
            </div>
          ))
        )}
      </section>
    </div>
  );
}
