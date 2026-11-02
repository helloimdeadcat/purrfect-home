import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import { asMoney } from "@/lib/calculations/money";
import { isPast, isWithinEndDate } from "@/lib/calculations/recurring-dates";
import {
  planReschedule,
  scheduleActuallyChanged,
} from "@/lib/calculations/recurring-reschedule";
import { addDaysIso } from "@/lib/calculations/timezone-date";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import { getHouseholdToday } from "@/services/settings-service";
import type {
  ConfirmOccurrenceInput,
  CreateRecurringInput,
  SkipOccurrenceInput,
  UpdateRecurringInput,
} from "@/lib/validations/recurring";
import type {
  Database,
  RecurringOccurrenceStatus,
} from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

export type ServiceError = {
  code: "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "DB" | "CONFLICT";
  message: string;
};

export type RecurringPaymentRow =
  Database["public"]["Tables"]["recurring_payments"]["Row"];
export type RecurringOccurrenceRow =
  Database["public"]["Tables"]["recurring_payment_occurrences"]["Row"];

export type RecurringPaymentView = RecurringPaymentRow & {
  categoryName: string | null;
  accountName: string | null;
  displayStatus: "active" | "paused" | "archived" | "ended";
};

export type DueOccurrenceView = RecurringOccurrenceRow & {
  paymentName: string;
  paymentType: "expense" | "income";
  templateAmount: string;
  currency: string;
  effectiveStatus: RecurringOccurrenceStatus;
};

function err(code: ServiceError["code"], message: string): ServiceError {
  return { code, message };
}

/** The SQL functions raise English messages; show them in Russian. */
const RECURRING_RPC_MESSAGES: Record<string, string> = {
  "Occurrence not found": "Платёж не найден",
  "Occurrence already processed": "Этот платёж уже обработан",
  "Occurrence cannot be confirmed": "Этот платёж нельзя подтвердить",
  Forbidden: "Нет доступа",
  "Cannot confirm an archived recurring payment": "Архивный регулярный платёж подтвердить нельзя",
  "Account not found or inactive": "Счёт не найден или неактивен",
  "Currency mismatch between template and account": "Валюта платежа не совпадает с валютой счёта",
  "Amount must be greater than zero": "Сумма должна быть больше нуля",
};

function translateRecurringRpcMessage(message: string): string {
  return RECURRING_RPC_MESSAGES[message] ?? message;
}

/**
 * Monthly and yearly schedules need a stored anchor day so that a short
 * month (Feb 28) does not permanently pull later dates earlier.
 */
function anchorDayOfMonth(
  frequency: RecurringPaymentRow["frequency"],
  dayOfMonth: number | null | undefined,
  startDate: string,
): number | null {
  if (frequency !== "monthly" && frequency !== "yearly") return null;
  return dayOfMonth ?? Number(startDate.slice(8, 10));
}

function displayStatus(row: RecurringPaymentRow): RecurringPaymentView["displayStatus"] {
  if (row.is_archived) return "archived";
  if (!row.is_active) return "paused";
  if (row.end_date && row.next_due_date > row.end_date) return "ended";
  return "active";
}

async function assertAccountAndCategory(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  accountId: string,
  categoryId: string,
  expectedType: "expense" | "income",
  currency?: string,
): Promise<{ currency: string } | { error: ServiceError }> {
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, currency, is_active, household_id")
    .eq("id", accountId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (accountError) {
    return { error: err("DB", accountError.message) };
  }
  if (!account || !account.is_active) {
    return { error: err("VALIDATION", "Счёт не найден или неактивен") };
  }

  const resolvedCurrency = (currency ?? account.currency).toUpperCase();
  if (resolvedCurrency !== account.currency.toUpperCase()) {
    return {
      error: err(
        "VALIDATION",
        "Валюта должна совпадать с валютой выбранного счёта (конвертации пока нет)",
      ),
    };
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, type, household_id, is_active")
    .eq("id", categoryId)
    .maybeSingle();

  if (categoryError) {
    return { error: err("DB", categoryError.message) };
  }
  if (
    !category ||
    !category.is_active ||
    (category.household_id !== null &&
      category.household_id !== ctx.householdId)
  ) {
    return { error: err("VALIDATION", "Категория не найдена") };
  }
  if (category.type !== "both" && category.type !== expectedType) {
    return {
      error: err("VALIDATION", "Тип категории не подходит к типу платежа"),
    };
  }

  return { currency: resolvedCurrency };
}

/** Ensure a pending occurrence exists for the template's next_due_date. */
export async function ensureNextOccurrence(
  supabase: AppSupabase,
  payment: RecurringPaymentRow,
): Promise<{ data: RecurringOccurrenceRow | null; error: ServiceError | null }> {
  if (payment.is_archived || !payment.is_active) {
    return { data: null, error: null };
  }
  if (!isWithinEndDate(payment.next_due_date, payment.end_date)) {
    return { data: null, error: null };
  }

  const { data: existing, error: existingError } = await supabase
    .from("recurring_payment_occurrences")
    .select("*")
    .eq("recurring_payment_id", payment.id)
    .eq("scheduled_date", payment.next_due_date)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (existing) {
    return { data: existing, error: null };
  }

  const { data, error } = await supabase
    .from("recurring_payment_occurrences")
    .insert({
      recurring_payment_id: payment.id,
      household_id: payment.household_id,
      scheduled_date: payment.next_due_date,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    // Race: another request created it
    if (error.code === "23505") {
      const { data: again } = await supabase
        .from("recurring_payment_occurrences")
        .select("*")
        .eq("recurring_payment_id", payment.id)
        .eq("scheduled_date", payment.next_due_date)
        .maybeSingle();
      return { data: again ?? null, error: null };
    }
    return { data: null, error: err("DB", error.message) };
  }

  return { data, error: null };
}

/**
 * Batch form of ensureNextOccurrence for list views: one read and at most one
 * insert instead of up to three round trips per template. Best-effort — a
 * concurrent insert of the same (payment, date) is ignored via the unique key.
 */
async function ensureNextOccurrences(
  supabase: AppSupabase,
  payments: RecurringPaymentRow[],
): Promise<void> {
  const due = payments.filter(
    (p) =>
      !p.is_archived &&
      p.is_active &&
      isWithinEndDate(p.next_due_date, p.end_date),
  );
  if (due.length === 0) return;

  const { data: existing, error } = await supabase
    .from("recurring_payment_occurrences")
    .select("recurring_payment_id, scheduled_date")
    .in(
      "recurring_payment_id",
      due.map((p) => p.id),
    )
    .in("scheduled_date", [...new Set(due.map((p) => p.next_due_date))]);
  if (error) return;

  const have = new Set(
    (existing ?? []).map((o) => `${o.recurring_payment_id}|${o.scheduled_date}`),
  );
  const missing = due.filter((p) => !have.has(`${p.id}|${p.next_due_date}`));
  if (missing.length === 0) return;

  await supabase.from("recurring_payment_occurrences").upsert(
    missing.map((p) => ({
      recurring_payment_id: p.id,
      household_id: p.household_id,
      scheduled_date: p.next_due_date,
      status: "pending" as const,
    })),
    { onConflict: "recurring_payment_id,scheduled_date", ignoreDuplicates: true },
  );
}

export async function listRecurringPayments(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  options?: { includeArchived?: boolean },
): Promise<{ data: RecurringPaymentView[] | null; error: ServiceError | null }> {
  let query = supabase
    .from("recurring_payments")
    .select("*")
    .eq("household_id", ctx.householdId)
    .order("next_due_date", { ascending: true });

  if (!options?.includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const rows = data ?? [];
  const categoryIds = [...new Set(rows.map((r) => r.category_id))];
  const accountIds = [...new Set(rows.map((r) => r.account_id))];

  const [{ data: categories }, { data: accounts }] = await Promise.all([
    categoryIds.length
      ? supabase.from("categories").select("id, name").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    accountIds.length
      ? supabase.from("accounts").select("id, name").in("id", accountIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const accMap = new Map((accounts ?? []).map((a) => [a.id, a.name]));

  // Lazily ensure upcoming occurrences for active templates
  await ensureNextOccurrences(supabase, rows);

  return {
    data: rows.map((row) => ({
      ...row,
      categoryName: catMap.get(row.category_id) ?? null,
      accountName: accMap.get(row.account_id) ?? null,
      displayStatus: displayStatus(row),
    })),
    error: null,
  };
}

export async function listDueOccurrences(
  supabase: AppSupabase,
  ctx: HouseholdContext,
): Promise<{ data: DueOccurrenceView[] | null; error: ServiceError | null }> {
  // Household-local day: a UTC "today" marks payments overdue a day early
  // (or late) depending on the household's offset.
  const { today } = await getHouseholdToday(supabase, ctx);

  // Refresh overdue statuses (best-effort)
  await supabase
    .from("recurring_payment_occurrences")
    .update({ status: "overdue" })
    .eq("household_id", ctx.householdId)
    .eq("status", "pending")
    .lt("scheduled_date", today);

  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("recurring_payment_occurrences")
      .select("*")
      .eq("household_id", ctx.householdId)
      .in("status", ["pending", "overdue"])
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  const occs = data ?? [];
  if (occs.length === 0) {
    return { data: [], error: null };
  }

  const paymentIds = [...new Set(occs.map((o) => o.recurring_payment_id))];
  const { data: payments, error: payError } = await supabase
    .from("recurring_payments")
    .select("id, name, type, amount, currency, is_active, is_archived")
    .in("id", paymentIds)
    .eq("household_id", ctx.householdId);

  if (payError) {
    return { data: null, error: err("DB", payError.message) };
  }

  const payMap = new Map((payments ?? []).map((p) => [p.id, p]));

  const views: DueOccurrenceView[] = [];
  for (const occ of occs) {
    const payment = payMap.get(occ.recurring_payment_id);
    if (!payment || payment.is_archived || !payment.is_active) continue;

    const effectiveStatus: RecurringOccurrenceStatus =
      occ.status === "pending" && isPast(occ.scheduled_date, today)
        ? "overdue"
        : occ.status;

    views.push({
      ...occ,
      paymentName: payment.name,
      paymentType: payment.type,
      templateAmount: asMoney(payment.amount),
      currency: payment.currency,
      effectiveStatus,
      amount: occ.amount != null ? asMoney(occ.amount) : occ.amount,
    });
  }

  return { data: views, error: null };
}

export async function listOccurrencesForPayment(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  paymentId: string,
): Promise<{ data: RecurringOccurrenceRow[] | null; error: ServiceError | null }> {
  const { data: payment, error: paymentError } = await supabase
    .from("recurring_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (paymentError) {
    return { data: null, error: err("DB", paymentError.message) };
  }
  if (!payment) {
    return { data: null, error: err("NOT_FOUND", "Регулярный платёж не найден") };
  }

  const { data, error } = await supabase
    .from("recurring_payment_occurrences")
    .select("*")
    .eq("recurring_payment_id", paymentId)
    .eq("household_id", ctx.householdId)
    .order("scheduled_date", { ascending: false })
    .limit(50);

  if (error) {
    return { data: null, error: err("DB", error.message) };
  }

  return { data: data ?? [], error: null };
}

export async function createRecurringPayment(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  input: CreateRecurringInput,
): Promise<{ data: RecurringPaymentRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут создавать регулярные платежи"),
    };
  }

  const check = await assertAccountAndCategory(
    supabase,
    ctx,
    input.accountId,
    input.categoryId,
    input.type,
    input.currency,
  );
  if ("error" in check) {
    return { data: null, error: check.error };
  }

  const { data, error } = await supabase
    .from("recurring_payments")
    .insert({
      household_id: ctx.householdId,
      name: input.name,
      type: input.type,
      amount: input.amount,
      currency: check.currency,
      category_id: input.categoryId,
      account_id: input.accountId,
      frequency: input.frequency,
      interval_days:
        input.frequency === "custom" ? (input.intervalDays ?? null) : null,
      day_of_month: anchorDayOfMonth(
        input.frequency,
        input.dayOfMonth,
        input.startDate,
      ),
      weekday: input.weekday ?? null,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      next_due_date: input.startDate,
      description: input.description ?? null,
      is_active: true,
      is_archived: false,
      auto_create: false,
      // Only sent when opting out: the column defaults to true, which keeps
      // creation working before the reserve migration is applied.
      ...(input.isMandatory === false ? { is_mandatory: false } : {}),
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось создать регулярный платёж"),
    };
  }

  await ensureNextOccurrence(supabase, data);

  return { data, error: null };
}

export async function updateRecurringPayment(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  paymentId: string,
  input: UpdateRecurringInput,
): Promise<{ data: RecurringPaymentRow | null; error: ServiceError | null }> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут менять регулярные платежи"),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("recurring_payments")
    .select("*")
    .eq("id", paymentId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { data: null, error: err("NOT_FOUND", "Регулярный платёж не найден") };
  }

  const nextType = input.type ?? existing.type;
  const nextAccountId = input.accountId ?? existing.account_id;
  const nextCategoryId = input.categoryId ?? existing.category_id;

  if (input.accountId || input.categoryId || input.type || input.amount) {
    const check = await assertAccountAndCategory(
      supabase,
      ctx,
      nextAccountId,
      nextCategoryId,
      nextType,
      existing.currency,
    );
    if ("error" in check) {
      return { data: null, error: check.error };
    }
  }

  const patch: Database["public"]["Tables"]["recurring_payments"]["Update"] = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.accountId !== undefined) patch.account_id = input.accountId;
  if (input.frequency !== undefined) patch.frequency = input.frequency;
  if (input.intervalDays !== undefined) patch.interval_days = input.intervalDays;
  if (input.dayOfMonth !== undefined) patch.day_of_month = input.dayOfMonth;
  if (input.weekday !== undefined) patch.weekday = input.weekday;
  if (input.endDate !== undefined) patch.end_date = input.endDate;
  if (input.description !== undefined) patch.description = input.description;
  if (input.isMandatory !== undefined) patch.is_mandatory = input.isMandatory;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.isArchived !== undefined) patch.is_archived = input.isArchived;

  const scheduleChanged = scheduleActuallyChanged(existing, input);

  if (scheduleChanged) {
    const nextFrequency = input.frequency ?? existing.frequency;
    patch.day_of_month = anchorDayOfMonth(
      nextFrequency,
      input.dayOfMonth !== undefined ? input.dayOfMonth : existing.day_of_month,
      existing.start_date,
    );
    if (nextFrequency !== "custom") patch.interval_days = null;
  }

  const { data, error } = await supabase
    .from("recurring_payments")
    .update(patch)
    .eq("id", paymentId)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось обновить регулярный платёж"),
    };
  }

  if (!scheduleChanged) {
    return { data, error: null };
  }

  return rescheduleAfterEdit(supabase, ctx, data);
}

/** Must match the note the audit trigger checks to suppress notifications. */
const SUPERSEDED_NOTE = "Superseded by schedule change";

/**
 * After a schedule edit, the old upcoming occurrence (e.g. "1st of month")
 * would otherwise sit next to the new projection ("15th") and be counted
 * twice by forecast and calendar. Future unprocessed occurrences that are no
 * longer on the schedule are marked skipped (kept for history; members may
 * not delete), next_due_date is re-derived, and the next occurrence ensured.
 * Past overdue occurrences are real obligations and are left untouched.
 */
async function rescheduleAfterEdit(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  payment: RecurringPaymentRow,
): Promise<{ data: RecurringPaymentRow | null; error: ServiceError | null }> {
  const { today } = await getHouseholdToday(supabase, ctx);

  const { data: future, error: futureError } = await supabase
    .from("recurring_payment_occurrences")
    .select("id, scheduled_date, status, notes")
    .eq("household_id", ctx.householdId)
    .eq("recurring_payment_id", payment.id)
    .in("status", ["pending", "skipped"])
    .is("transaction_id", null)
    .gte("scheduled_date", today);
  if (futureError) {
    return { data: null, error: err("DB", futureError.message) };
  }
  const futurePending = (future ?? []).filter((occ) => occ.status === "pending");
  const futureSuperseded = (future ?? []).filter(
    (occ) => occ.status === "skipped" && occ.notes === SUPERSEDED_NOTE,
  );

  const plan = planReschedule({
    template: {
      startDate: payment.start_date,
      endDate: payment.end_date,
      frequency: payment.frequency,
      intervalDays: payment.interval_days,
      dayOfMonth: payment.day_of_month,
      weekday: payment.weekday,
    },
    today,
    futurePending,
    futureSuperseded,
  });

  if (plan.reviveIds.length > 0) {
    const { error: reviveError } = await supabase
      .from("recurring_payment_occurrences")
      .update({ status: "pending", notes: null, processed_at: null, processed_by: null })
      .eq("household_id", ctx.householdId)
      .in("id", plan.reviveIds);
    if (reviveError) {
      return { data: null, error: err("DB", reviveError.message) };
    }
  }

  if (plan.supersedeIds.length > 0) {
    const { error: supersedeError } = await supabase
      .from("recurring_payment_occurrences")
      .update({
        status: "skipped",
        notes: SUPERSEDED_NOTE,
        processed_at: new Date().toISOString(),
        processed_by: ctx.user.id,
      })
      .eq("household_id", ctx.householdId)
      .in("id", plan.supersedeIds);
    if (supersedeError) {
      return { data: null, error: err("DB", supersedeError.message) };
    }
  }

  // No remaining date (end_date passed): park next_due_date after end_date
  // so the template reads as "ended" and no occurrence is generated.
  const nextDue =
    plan.nextDue ??
    (payment.end_date ? addDaysIso(payment.end_date, 1) : payment.next_due_date);

  const { data, error } = await supabase
    .from("recurring_payments")
    .update({ next_due_date: nextDue })
    .eq("id", payment.id)
    .eq("household_id", ctx.householdId)
    .select("*")
    .single();

  if (error || !data) {
    return {
      data: null,
      error: err("DB", error?.message ?? "Не получилось перенести регулярный платёж"),
    };
  }

  const ensured = await ensureNextOccurrence(supabase, data);
  if (ensured.error) {
    return { data: null, error: ensured.error };
  }

  return { data, error: null };
}

export async function deleteRecurringPayment(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  paymentId: string,
): Promise<{ error: ServiceError | null }> {
  if (!canAdmin(ctx.role)) {
    return {
      error: err(
        "FORBIDDEN",
        "Удалять регулярные платежи могут только владельцы и админы",
      ),
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("recurring_payments")
    .select("id")
    .eq("id", paymentId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (existingError) {
    return { error: err("DB", existingError.message) };
  }
  if (!existing) {
    return { error: err("NOT_FOUND", "Регулярный платёж не найден") };
  }

  const { error } = await supabase
    .from("recurring_payments")
    .delete()
    .eq("id", paymentId)
    .eq("household_id", ctx.householdId);

  if (error) {
    return { error: err("DB", error.message) };
  }
  return { error: null };
}

export async function confirmOccurrence(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  occurrenceId: string,
  input: ConfirmOccurrenceInput = {},
): Promise<{
  data: {
    occurrenceId: string;
    transactionId: string;
    nextDueDate: string;
  } | null;
  error: ServiceError | null;
}> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут подтверждать платежи"),
    };
  }

  // Pre-check household ownership of occurrence
  const { data: occ, error: occError } = await supabase
    .from("recurring_payment_occurrences")
    .select("id, household_id, status")
    .eq("id", occurrenceId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (occError) {
    return { data: null, error: err("DB", occError.message) };
  }
  if (!occ) {
    return { data: null, error: err("NOT_FOUND", "Платёж не найден") };
  }
  if (occ.status === "paid" || occ.status === "skipped") {
    return {
      data: null,
      error: err("CONFLICT", "Этот платёж уже обработан"),
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "confirm_recurring_occurrence",
    {
      p_occurrence_id: occurrenceId,
      p_amount: input.amount ?? null,
      p_transaction_date: input.transactionDate ?? null,
      p_notes: input.notes ?? null,
    },
  );

  if (rpcError) {
    const message = rpcError.message || "Could not confirm occurrence";
    if (
      message.includes("already processed") ||
      message.includes("Currency mismatch") ||
      message.includes("Amount must") ||
      message.includes("archived") ||
      message.includes("Account not found") ||
      message.includes("Forbidden")
    ) {
      const code = message.includes("already")
        ? "CONFLICT"
        : message.includes("Forbidden")
          ? "FORBIDDEN"
          : "VALIDATION";
      return {
        data: null,
        error: err(code, translateRecurringRpcMessage(message.replace(/^.*?: /, ""))),
      };
    }
    return { data: null, error: err("DB", "Не получилось подтвердить платёж") };
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
    occurrence_id: string;
    transaction_id: string;
    next_due_date: string;
  } | null;

  if (!row?.transaction_id) {
    return { data: null, error: err("DB", "После подтверждения не нашлось операции") };
  }

  return {
    data: {
      occurrenceId: row.occurrence_id,
      transactionId: row.transaction_id,
      nextDueDate: row.next_due_date,
    },
    error: null,
  };
}

export async function skipOccurrence(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  occurrenceId: string,
  input: SkipOccurrenceInput = {},
): Promise<{
  data: { occurrenceId: string; nextDueDate: string } | null;
  error: ServiceError | null;
}> {
  if (!canWrite(ctx.role)) {
    return {
      data: null,
      error: err("FORBIDDEN", "Наблюдатели не могут пропускать платежи"),
    };
  }

  const { data: occ, error: occError } = await supabase
    .from("recurring_payment_occurrences")
    .select("id, status")
    .eq("id", occurrenceId)
    .eq("household_id", ctx.householdId)
    .maybeSingle();

  if (occError) {
    return { data: null, error: err("DB", occError.message) };
  }
  if (!occ) {
    return { data: null, error: err("NOT_FOUND", "Платёж не найден") };
  }
  if (occ.status === "paid" || occ.status === "skipped") {
    return {
      data: null,
      error: err("CONFLICT", "Этот платёж уже обработан"),
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "skip_recurring_occurrence",
    {
      p_occurrence_id: occurrenceId,
      p_notes: input.notes ?? null,
    },
  );

  if (rpcError) {
    const message = rpcError.message || "Could not skip occurrence";
    if (message.includes("already processed")) {
      return {
        data: null,
        error: err("CONFLICT", "Этот платёж уже обработан"),
      };
    }
    return { data: null, error: err("DB", "Не получилось пропустить платёж") };
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
    occurrence_id: string;
    next_due_date: string;
  } | null;

  return {
    data: {
      occurrenceId: row?.occurrence_id ?? occurrenceId,
      nextDueDate: row?.next_due_date ?? "",
    },
    error: null,
  };
}
