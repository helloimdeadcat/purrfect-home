import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import {
  monthEndIso,
  monthStartIso,
} from "@/lib/calculations/budget-month";
import { asMoney } from "@/lib/calculations/money";
import {
  isPast,
  listRecurringDatesInRange,
} from "@/lib/calculations/recurring-dates";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { getHouseholdToday } from "@/services/settings-service";
import type {
  Database,
  RecurringOccurrenceStatus,
} from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB";
  message: string;
};

export type CalendarEventKind =
  | "recurring_occurrence"
  | "recurring_projected"
  | "transaction";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  date: string;
  title: string;
  amount: string;
  currency: string;
  cashFlow: "income" | "expense" | "neutral";
  /** True only for confirmed/paid money — projected/pending never count as facts. */
  isActual: boolean;
  status?: RecurringOccurrenceStatus | "scheduled";
  occurrenceId?: string;
  paymentId?: string;
  transactionId?: string;
};

export type CalendarMonthView = {
  year: number;
  month: number;
  rangeStart: string;
  rangeEnd: string;
  today: string;
  events: CalendarEvent[];
  eventsByDate: Record<string, CalendarEvent[]>;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  for (const event of events) {
    if (!map[event.date]) map[event.date] = [];
    map[event.date].push(event);
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }
  return map;
}

/**
 * Month payment calendar: real transactions + recurring occurrences +
 * read-only projected recurring dates (no auto-posting).
 */
export async function getCalendarMonth(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  year: number,
  month: number,
): Promise<{ data: CalendarMonthView | null; error: ServiceError | null }> {
  if (month < 1 || month > 12 || year < 1970 || year > 2100) {
    return { data: null, error: err("VALIDATION", "Неверный месяц") };
  }

  const rangeStart = monthStartIso(year, month);
  const rangeEnd = monthEndIso(year, month);
  const { today } = await getHouseholdToday(supabase, ctx);

  const [occResult, paymentsResult, txResult] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("recurring_payment_occurrences")
        .select("*")
        .eq("household_id", ctx.householdId)
        .gte("scheduled_date", rangeStart)
        .lte("scheduled_date", rangeEnd)
        .order("scheduled_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("recurring_payments")
        .select("*")
        .eq("household_id", ctx.householdId)
        .eq("is_archived", false)
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("transactions")
        .select("id, type, amount, currency, transaction_date, description, merchant")
        .eq("household_id", ctx.householdId)
        .is("deleted_at", null)
        .in("type", ["income", "expense"])
        .gte("transaction_date", rangeStart)
        .lte("transaction_date", rangeEnd)
        .order("transaction_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (occResult.error) {
    return { data: null, error: err("DB", occResult.error.message) };
  }
  if (paymentsResult.error) {
    return { data: null, error: err("DB", paymentsResult.error.message) };
  }
  if (txResult.error) {
    return { data: null, error: err("DB", txResult.error.message) };
  }

  const events = buildCalendarEvents({
    occurrences: occResult.data ?? [],
    payments: paymentsResult.data ?? [],
    transactions: txResult.data ?? [],
    today,
    rangeStart,
    rangeEnd,
    fallbackCurrency: ctx.currency,
  });

  return {
    data: {
      year,
      month,
      rangeStart,
      rangeEnd,
      today,
      events,
      eventsByDate: groupByDate(events),
    },
    error: null,
  };
}

type OccurrenceRow =
  Database["public"]["Tables"]["recurring_payment_occurrences"]["Row"];
type PaymentRow = Database["public"]["Tables"]["recurring_payments"]["Row"];
type CalendarTxRow = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  | "id"
  | "type"
  | "amount"
  | "currency"
  | "transaction_date"
  | "description"
  | "merchant"
>;

/**
 * Pure event assembly. Only real transactions are actual cash flow; recurring
 * occurrences (any status) and projections are schedule information.
 */
export function buildCalendarEvents(input: {
  occurrences: OccurrenceRow[];
  payments: PaymentRow[];
  transactions: CalendarTxRow[];
  today: string;
  rangeStart: string;
  rangeEnd: string;
  fallbackCurrency: string;
}): CalendarEvent[] {
  const { payments, today, rangeStart, rangeEnd } = input;
  const events: CalendarEvent[] = [];
  const payMap = new Map(payments.map((p) => [p.id, p]));
  const occDatesByPayment = new Map<string, Set<string>>();

  for (const occ of input.occurrences) {
    const payment = payMap.get(occ.recurring_payment_id);
    const title = payment?.name ?? "Регулярный платёж";
    const amount = asMoney(occ.amount ?? payment?.amount ?? "0.00");
    const currency = payment?.currency ?? input.fallbackCurrency;
    const cashFlow =
      payment?.type === "income"
        ? "income"
        : payment?.type === "expense"
          ? "expense"
          : "neutral";

    let status: RecurringOccurrenceStatus = occ.status;
    if (status === "pending" && isPast(occ.scheduled_date, today)) {
      status = "overdue";
    }

    // Confirming an occurrence creates a real transaction, which is listed
    // below as the actual cash flow. Counting the paid occurrence as well
    // would double it, so occurrences are schedule markers only.
    const isActual = false;

    events.push({
      id: `occ:${occ.id}`,
      kind: "recurring_occurrence",
      date: occ.scheduled_date,
      title,
      amount,
      currency,
      cashFlow,
      isActual,
      status,
      occurrenceId: occ.id,
      paymentId: occ.recurring_payment_id,
      transactionId: occ.transaction_id ?? undefined,
    });

    const set = occDatesByPayment.get(occ.recurring_payment_id) ?? new Set();
    set.add(occ.scheduled_date);
    occDatesByPayment.set(occ.recurring_payment_id, set);
  }

  for (const payment of payments) {
    const projected = listRecurringDatesInRange(
      {
        startDate: payment.start_date,
        endDate: payment.end_date,
        frequency: payment.frequency,
        intervalDays: payment.interval_days,
        dayOfMonth: payment.day_of_month,
        weekday: payment.weekday,
      },
      rangeStart,
      rangeEnd,
    );
    const existing = occDatesByPayment.get(payment.id) ?? new Set();
    for (const date of projected) {
      if (existing.has(date)) continue;
      // Only project future (or today) slots that are not yet materialised.
      // Past missing slots without an occurrence are still shown as scheduled
      // so the household can see gaps — but never as actual cash flow.
      events.push({
        id: `proj:${payment.id}:${date}`,
        kind: "recurring_projected",
        date,
        title: payment.name,
        amount: asMoney(payment.amount),
        currency: payment.currency,
        cashFlow: payment.type === "income" ? "income" : "expense",
        isActual: false,
        status: "scheduled",
        paymentId: payment.id,
      });
    }
  }

  for (const tx of input.transactions) {
    if (tx.type !== "income" && tx.type !== "expense") continue;
    events.push({
      id: `tx:${tx.id}`,
      kind: "transaction",
      date: tx.transaction_date,
      title: tx.description || tx.merchant || tx.type,
      amount: asMoney(tx.amount),
      currency: tx.currency,
      cashFlow: tx.type === "income" ? "income" : "expense",
      isActual: true,
      transactionId: tx.id,
    });
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });

  return events;
}
