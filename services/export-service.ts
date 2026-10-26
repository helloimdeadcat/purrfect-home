import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { toCsv, type CsvCell } from "@/lib/export/csv";
import { asMoney } from "@/lib/calculations/money";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import type { AnalyticsQueryInput } from "@/lib/validations/analytics";
import type { TransactionExportInput } from "@/lib/validations/export";
import { getAnalyticsReport } from "@/services/analytics-service";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** Keeps `.in()` filters well under PostgREST URL length limits. */
const ID_CHUNK = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const TRANSACTION_CSV_HEADER = [
  "date",
  "type",
  "adjustment_direction",
  "amount",
  "currency",
  "account",
  "category",
  "income_source",
  "tags",
  "merchant",
  "description",
  "notes",
];

/**
 * Factual transactions for a date range (soft-deleted rows excluded).
 * Transfers live in their own table and are not household income/expense,
 * so they are not part of this export. Amounts are never converted.
 */
export async function exportTransactionsCsv(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: TransactionExportInput,
): Promise<{ data: string | null; error: ServiceError | null }> {
  const { data: txns, error } = await fetchAllPages((from, to) => {
    let query = supabase
      .from("transactions")
      .select(
        "id, transaction_date, type, adjustment_direction, amount, currency, account_id, category_id, income_source_id, merchant, description, notes",
      )
      .eq("household_id", ctx.householdId)
      .is("deleted_at", null)
      .gte("transaction_date", input.from)
      .lte("transaction_date", input.to);
    if (input.currency) query = query.eq("currency", input.currency);
    if (input.accountId) query = query.eq("account_id", input.accountId);
    return query
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  });
  if (error) return { data: null, error: err("DB", error.message) };
  const rows = txns ?? [];

  const [accounts, categories, sources, tags] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("household_id", ctx.householdId),
    supabase.from("categories").select("id, name"),
    supabase.from("income_sources").select("id, name").eq("household_id", ctx.householdId),
    supabase.from("tags").select("id, name").eq("household_id", ctx.householdId),
  ]);
  for (const result of [accounts, categories, sources, tags]) {
    if (result.error) return { data: null, error: err("DB", result.error.message) };
  }
  const accountName = new Map((accounts.data ?? []).map((r) => [r.id, r.name]));
  const categoryName = new Map((categories.data ?? []).map((r) => [r.id, r.name]));
  const sourceName = new Map((sources.data ?? []).map((r) => [r.id, r.name]));
  const tagName = new Map((tags.data ?? []).map((r) => [r.id, r.name]));

  const tagsByTx = new Map<string, string[]>();
  for (const ids of chunk(rows.map((r) => r.id), ID_CHUNK)) {
    const { data: links, error: linkError } = await supabase
      .from("transaction_tags")
      .select("transaction_id, tag_id")
      .in("transaction_id", ids);
    if (linkError) return { data: null, error: err("DB", linkError.message) };
    for (const link of links ?? []) {
      const name = tagName.get(link.tag_id);
      if (!name) continue;
      const list = tagsByTx.get(link.transaction_id) ?? [];
      list.push(name);
      tagsByTx.set(link.transaction_id, list);
    }
  }

  const body: CsvCell[][] = rows.map((r) => [
    r.transaction_date,
    r.type,
    r.adjustment_direction ?? "",
    { numeric: asMoney(r.amount) },
    r.currency,
    accountName.get(r.account_id) ?? "",
    r.category_id ? (categoryName.get(r.category_id) ?? "") : "",
    r.income_source_id ? (sourceName.get(r.income_source_id) ?? "") : "",
    (tagsByTx.get(r.id) ?? []).sort().join("; "),
    r.merchant,
    r.description,
    r.notes,
  ]);

  return { data: toCsv(TRANSACTION_CSV_HEADER, body), error: null };
}

export const ANALYTICS_CSV_HEADER = ["section", "item", "period", "amount", "currency"];

/**
 * The analytics report in long format (one value per row) — easy to pivot
 * in a spreadsheet. Single currency, actuals only: no forecast or planned
 * amounts are included.
 */
export async function exportAnalyticsCsv(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: AnalyticsQueryInput,
): Promise<{
  data: { csv: string; currency: string; start: string; end: string } | null;
  error: ServiceError | null;
}> {
  const { data: report, error } = await getAnalyticsReport(supabase, ctx, input);
  if (error || !report) return { data: null, error: error ?? err("DB", "Report unavailable") };

  const c = report.currency;
  const period = `${report.range.start}..${report.range.end}`;
  const previous = `${report.previousRange.start}..${report.previousRange.end}`;
  const num = (value: string) => ({ numeric: asMoney(value) });

  const rows: CsvCell[][] = [
    ["summary", "income", period, num(report.summary.income), c],
    ["summary", "expense", period, num(report.summary.expense), c],
    ["summary", "net", period, num(report.summary.net), c],
    ["summary_previous", "income", previous, num(report.summary.previousIncome), c],
    ["summary_previous", "expense", previous, num(report.summary.previousExpense), c],
    ["summary_previous", "net", previous, num(report.summary.previousNet), c],
  ];
  for (const point of report.cashFlow) {
    rows.push(["cash_flow", "income", point.month, num(point.income), c]);
    rows.push(["cash_flow", "expense", point.month, num(point.expense), c]);
    rows.push(["cash_flow", "net", point.month, num(point.net), c]);
  }
  for (const row of report.expensesByCategory) {
    rows.push(["expenses_by_category", row.categoryName, period, num(row.amount), c]);
  }
  for (const row of report.incomeByCategory) {
    rows.push(["income_by_category", row.categoryName, period, num(row.amount), c]);
  }
  for (const row of report.incomeBySource) {
    rows.push(["income_by_source", row.sourceName, period, num(row.amount), c]);
  }
  for (const row of report.budgets.rows) {
    const label = row.categoryName ?? "Budget";
    rows.push(["budget_limit", label, report.budgets.month, num(row.limit), c]);
    rows.push(["budget_spent", label, report.budgets.month, num(row.spent), c]);
  }

  return {
    data: {
      csv: toCsv(ANALYTICS_CSV_HEADER, rows),
      currency: c,
      start: report.range.start,
      end: report.range.end,
    },
    error: null,
  };
}
