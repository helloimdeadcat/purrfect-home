import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { calculateAccountBalance, summarizeBalancesByCurrency } from "@/lib/calculations/account-balance";
import { buildForecast } from "@/lib/calculations/forecast";
import { resolveForecastHorizon } from "@/lib/calculations/forecast-horizon";
import { zeroMoney } from "@/lib/calculations/money";
import { buildAgenda, isoWeekday, weekStart, type AgendaItem, type AgendaTask } from "@/lib/calculations/task-schedule";
import { buildPeople } from "@/lib/people";
import { fetchAllPages } from "@/lib/supabase/fetch-all";
import {
  countTasks,
  formatDigest,
  groupCheckins,
  pendingHabits,
  settleSection,
  summarizeMealsDay,
  summarizeMoney,
  todayItems,
  type MealsDay,
  type MoneyDay,
  type PendingHabit,
  type SummaryHabit,
  type SummarySection,
  type TaskCounts,
} from "@/lib/summary/daily-summary";
import { listFamilyMembers } from "@/services/family-service";
import {
  buildCandidates,
  getForecastReport,
  type ForecastPaymentRow,
  type ForecastReport,
} from "@/services/forecast-service";
import { rowToRules } from "@/services/habit-service";
import { getHouseholdToday, householdTodayFromSettings } from "@/services/settings-service";
import { rowToRepeat } from "@/services/task-service";
import { loadTaskView, type TaskView } from "@/services/task-view-service";
import type { Database, Money } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;
type Loaded<T> = { data: T | null; error: { message: string } | null };

// ---------------------------------------------------------------------------
// Lean per-household loaders (no auth.uid(): every query filters by
// household explicitly, so they work with the RLS client and the
// service-role client alike). Only the columns the summary needs.
// ---------------------------------------------------------------------------

const TASK_COLUMNS =
  "id, title, kind, start_date, start_time, end_time, repeat_kind, repeat_interval, repeat_weekdays, repeat_day_of_month, repeat_until, assignee_member_id, completed_at";

/** Today's agenda items (incl. overdue one-offs). 2 queries. */
export async function loadTodayTaskItems(
  client: AppSupabase,
  householdId: string,
  today: string,
): Promise<Loaded<AgendaItem[]>> {
  const [tasksResult, completionsResult] = await Promise.all([
    fetchAllPages((from, to) =>
      client
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("household_id", householdId)
        .eq("is_archived", false)
        .lte("start_date", today)
        // Repeating tasks, or one-offs still open (done one-offs are not news).
        .or("repeat_kind.neq.none,completed_at.is.null")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    client
      .from("task_completions")
      .select("task_id")
      .eq("household_id", householdId)
      .eq("occurrence_date", today),
  ]);
  if (tasksResult.error) return { data: null, error: tasksResult.error };
  if (completionsResult.error) return { data: null, error: completionsResult.error };

  const completions = new Map<string, Set<string>>();
  for (const row of completionsResult.data ?? []) completions.set(row.task_id, new Set([today]));

  const tasks: AgendaTask[] = (tasksResult.data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    startDate: row.start_date,
    startTime: row.start_time ? row.start_time.slice(0, 5) : null,
    endTime: row.end_time ? row.end_time.slice(0, 5) : null,
    repeat: rowToRepeat(row),
    repeatUntil: row.repeat_until,
    assigneeMemberId: row.assignee_member_id,
    completedAt: row.completed_at,
  }));
  const agenda = buildAgenda({ tasks, completions, from: today, to: today, today });
  return { data: todayItems(agenda, today), error: null };
}

/** Active plan's meals for today's weekday with kcal per member. ≤ 5 queries. */
export async function loadMealsDay(
  client: AppSupabase,
  householdId: string,
  today: string,
): Promise<Loaded<MealsDay>> {
  const [planResult, targetsResult] = await Promise.all([
    client.from("meal_plans").select("id").eq("household_id", householdId).eq("is_active", true).maybeSingle(),
    client.from("nutrition_targets").select("member_id, kcal").eq("household_id", householdId),
  ]);
  if (planResult.error) return { data: null, error: planResult.error };
  if (targetsResult.error) return { data: null, error: targetsResult.error };
  const targets = targetsResult.data ?? [];
  if (!planResult.data) {
    return { data: summarizeMealsDay({ hasPlan: false, meals: [], portions: [], kcalPer100g: new Map(), targets }), error: null };
  }

  const mealsResult = await client
    .from("meal_plan_meals")
    .select("id, slot, title, position")
    .eq("household_id", householdId)
    .eq("plan_id", planResult.data.id)
    .eq("weekday", isoWeekday(today));
  if (mealsResult.error) return { data: null, error: mealsResult.error };
  const meals = mealsResult.data ?? [];

  let portions: { meal_id: string; food_id: string; member_id: string; grams: Money | number }[] = [];
  const kcalPer100g = new Map<string, number>();
  if (meals.length > 0) {
    const portionsResult = await client
      .from("meal_plan_portions")
      .select("meal_id, food_id, member_id, grams")
      .eq("household_id", householdId)
      .in(
        "meal_id",
        meals.map((m) => m.id),
      );
    if (portionsResult.error) return { data: null, error: portionsResult.error };
    portions = portionsResult.data ?? [];

    const foodIds = [...new Set(portions.map((p) => p.food_id))];
    if (foodIds.length > 0) {
      const foodsResult = await client.from("foods").select("id, kcal").eq("household_id", householdId).in("id", foodIds);
      if (foodsResult.error) return { data: null, error: foodsResult.error };
      for (const food of foodsResult.data ?? []) kcalPer100g.set(food.id, Number(food.kcal));
    }
  }

  return {
    data: summarizeMealsDay({
      hasPlan: true,
      meals,
      portions: portions.map((p) => ({ mealId: p.meal_id, foodId: p.food_id, memberId: p.member_id, grams: Number(p.grams) })),
      kcalPer100g,
      targets,
    }),
    error: null,
  };
}

const HABIT_COLUMNS =
  "id, title, emoji, owner_member_id, goal_kind, target, unit, frequency, weekdays, times_per_week, start_date";

/** Active habits + this ISO week's check-ins (enough for today and per_week). 2 queries. */
export async function loadHabitsToday(
  client: AppSupabase,
  householdId: string,
  today: string,
): Promise<Loaded<{ habits: SummaryHabit[]; checkins: ReturnType<typeof groupCheckins> }>> {
  const [habitsResult, checkinsResult] = await Promise.all([
    client.from("habits").select(HABIT_COLUMNS).eq("household_id", householdId).eq("is_archived", false),
    fetchAllPages((from, to) =>
      client
        .from("habit_checkins")
        .select("id, habit_id, member_id, checkin_date, value")
        .eq("household_id", householdId)
        .gte("checkin_date", weekStart(today))
        .lte("checkin_date", today)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (habitsResult.error) return { data: null, error: habitsResult.error };
  if (checkinsResult.error) return { data: null, error: checkinsResult.error };
  return {
    data: {
      habits: (habitsResult.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        emoji: row.emoji,
        ownerMemberId: row.owner_member_id,
        rules: rowToRules(row),
      })),
      checkins: groupCheckins(checkinsResult.data ?? []),
    },
    error: null,
  };
}

/**
 * Safe-to-Spend (end of month, like the dashboard) + payments due by today,
 * from lean columns. Same formulas: account-balance + forecast-service
 * candidates + buildForecast. 5 queries.
 */
export async function loadMoneyDay(
  client: AppSupabase,
  input: { householdId: string; baseCurrency: string; today: string; reserves: Record<string, string> },
): Promise<Loaded<MoneyDay>> {
  const { householdId, baseCurrency, today, reserves } = input;
  const range = resolveForecastHorizon("end_of_month", { today });
  const [accountsResult, txResult, transferResult, paymentsResult, occResult] = await Promise.all([
    client.from("accounts").select("id, currency, initial_balance, is_active").eq("household_id", householdId),
    fetchAllPages((from, to) =>
      client
        .from("transactions")
        .select("id, account_id, type, amount, adjustment_direction")
        .eq("household_id", householdId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      client
        .from("transfers")
        .select("id, from_account_id, to_account_id, amount")
        .eq("household_id", householdId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // "*" on purpose: is_mandatory only exists after migration 13 and the
    // table is tiny (one row per recurring payment).
    client
      .from("recurring_payments")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_archived", false)
      .eq("is_active", true),
    fetchAllPages((from, to) =>
      client
        .from("recurring_payment_occurrences")
        .select("id, recurring_payment_id, scheduled_date, status, amount, transaction_id")
        .eq("household_id", householdId)
        .lte("scheduled_date", range.end)
        .or(`scheduled_date.gte.${today},status.in.(pending,overdue)`)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  for (const result of [accountsResult, txResult, transferResult, paymentsResult, occResult]) {
    if (result.error) return { data: null, error: result.error };
  }

  const transactions = txResult.data ?? [];
  const transfers = transferResult.data ?? [];
  const accounts = (accountsResult.data ?? []).map((account) => ({
    currency: account.currency,
    is_active: account.is_active,
    balance: calculateAccountBalance({
      accountId: account.id,
      initialBalance: account.initial_balance,
      transactions: transactions.filter((tx) => tx.account_id === account.id),
      transfers: transfers.filter((t) => t.from_account_id === account.id || t.to_account_id === account.id),
    }),
  }));

  // Same shape as forecast-service: base currency always present.
  const base = baseCurrency.toUpperCase();
  const wealth = summarizeBalancesByCurrency(accounts, base);
  const balancesByCurrency: Record<string, Money> = { [base]: wealth.baseTotal };
  for (const other of wealth.otherCurrencies) balancesByCurrency[other.currency.toUpperCase()] = other.total;
  for (const account of accounts) {
    const code = account.currency.toUpperCase();
    if (account.is_active && !(code in balancesByCurrency)) balancesByCurrency[code] = zeroMoney();
  }

  const built = buildForecast({
    today,
    horizonEnd: range.end,
    balancesByCurrency,
    candidates: buildCandidates({
      payments: (paymentsResult.data ?? []) as ForecastPaymentRow[],
      occurrences: occResult.data ?? [],
      today,
      horizonEnd: range.end,
      fallbackCurrency: baseCurrency,
    }),
    reserveByCurrency: reserves,
  });

  return {
    data: summarizeMoney({
      baseCurrency,
      today,
      currencies: built.byCurrency,
      obligations: built.included,
    }),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Dashboard: «Сводка на сегодня» for the signed-in user
// ---------------------------------------------------------------------------

export type SummaryTaskLine = { item: AgendaItem; personLabel: string; personColor: string };

export type SummaryMealPerson = {
  memberId: string;
  label: string;
  isYou: boolean;
  kcal: number;
  targetKcal: number | null;
};

export type DailySummary = {
  today: string;
  tasks: SummarySection<{ counts: TaskCounts; items: SummaryTaskLine[]; canEdit: boolean; partnerLabel: string | null }>;
  meals: SummarySection<MealsDay & { people: SummaryMealPerson[] }>;
  habits: SummarySection<PendingHabit[]>;
  money: SummarySection<MoneyDay>;
};

/** Data the dashboard already loaded; reused instead of querying twice. */
export type DailySummaryPrefetched = {
  today?: string;
  /** loadTaskView result for [today, today] (null = not available). */
  taskView?: TaskView | null;
  /** Reused only when it is the default end-of-month, all-currency report. */
  forecast?: ForecastReport | null;
};

export async function buildDailySummary(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  prefetched: DailySummaryPrefetched = {},
): Promise<DailySummary> {
  const today = prefetched.today ?? (await getHouseholdToday(supabase, ctx)).today;

  const taskViewPromise: Promise<TaskView | null> =
    prefetched.taskView !== undefined
      ? Promise.resolve(prefetched.taskView)
      : loadTaskView(supabase, ctx, { from: today, to: today })
          .then((r) => r.data)
          .catch(() => null);

  const peoplePromise = taskViewPromise.then(async (view) => {
    if (view) return view.people;
    const members = await listFamilyMembers(supabase, ctx).catch(() => ({ data: null }));
    return buildPeople(members.data ?? [], ctx.user.id);
  });

  const reusableForecast =
    prefetched.forecast && prefetched.forecast.horizon === "end_of_month" && !prefetched.forecast.focusCurrency
      ? prefetched.forecast
      : null;

  const [tasks, meals, habits, money] = await Promise.all([
    settleSection(async () => {
      const view = await taskViewPromise;
      if (!view) return { data: null, error: "unavailable" };
      const items = todayItems(view.agenda, today);
      const partner = view.people.list.find((p) => !p.isYou);
      // Open first (overdue on top), then done.
      const ordered = [...items.filter((i) => !i.done), ...items.filter((i) => i.done)];
      return {
        data: {
          counts: countTasks(items, view.myMemberId),
          items: ordered.map((item) => {
            const person = view.personOf(item);
            return { item, personLabel: person.label, personColor: person.color };
          }),
          canEdit: view.canEdit,
          partnerLabel: partner?.label ?? null,
        },
        error: null,
      };
    }),
    settleSection(async () => {
      const [day, people] = await Promise.all([loadMealsDay(supabase, ctx.householdId, today), peoplePromise]);
      if (!day.data) return { data: null, error: day.error };
      const rows: SummaryMealPerson[] = people.list
        .map((person) => {
          const kcal = day.data!.byMember[person.memberId!];
          return {
            memberId: person.memberId!,
            label: person.label,
            isYou: person.isYou,
            kcal: kcal?.kcal ?? 0,
            targetKcal: kcal?.targetKcal ?? null,
          };
        })
        .filter((row) => row.kcal > 0 || row.targetKcal !== null)
        .sort((a, b) => Number(b.isYou) - Number(a.isYou));
      return { data: { ...day.data, people: rows }, error: null };
    }),
    settleSection(async () => {
      const loaded = await loadHabitsToday(supabase, ctx.householdId, today);
      if (!loaded.data) return { data: null, error: loaded.error };
      return {
        data: pendingHabits(loaded.data.habits, loaded.data.checkins, ctx.membershipId, today),
        error: null,
      };
    }),
    settleSection(async () => {
      const report =
        reusableForecast ?? (await getForecastReport(supabase, ctx, { horizon: "end_of_month" })).data;
      if (!report) return { data: null, error: "unavailable" };
      return {
        data: summarizeMoney({
          baseCurrency: ctx.currency,
          today,
          currencies: report.currencies,
          obligations: report.includedObligations,
        }),
        error: null,
      };
    }),
  ]);

  return { today, tasks, meals, habits, money };
}

// ---------------------------------------------------------------------------
// Morning push digests (service-role client, called from the daily cron)
// ---------------------------------------------------------------------------

export type MorningDigest = { userId: string; title: string; body: string; url: string };

type MemberRow = { id: string; user_id: string; household_id: string; display_name: string | null; joined_at: string };

function reservesFrom(settings: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = settings?.safe_to_spend_reserves;
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}

/**
 * Digest for every member of one household. 14 queries, all in parallel
 * groups: tasks 2, habits 2, meals ≤ 5, money 5 — independent of the
 * number of members.
 */
async function householdDigests(
  admin: AppSupabase,
  input: {
    householdId: string;
    baseCurrency: string;
    settings: Record<string, unknown> | null;
    members: MemberRow[];
    now: Date;
  },
): Promise<MorningDigest[]> {
  const { today } = householdTodayFromSettings(
    input.settings ? { timezone: String(input.settings.timezone ?? "") } : null,
    input.now,
  );

  const [tasks, habits, meals, money] = await Promise.all([
    settleSection(() => loadTodayTaskItems(admin, input.householdId, today)),
    settleSection(() => loadHabitsToday(admin, input.householdId, today)),
    settleSection(() => loadMealsDay(admin, input.householdId, today)),
    settleSection(() =>
      loadMoneyDay(admin, {
        householdId: input.householdId,
        baseCurrency: input.baseCurrency,
        today,
        reserves: reservesFrom(input.settings),
      }),
    ),
  ]);

  const digests: MorningDigest[] = [];
  for (const member of input.members) {
    const counts = tasks.ok ? countTasks(tasks.data, member.id) : null;
    const kcal = meals.ok ? meals.data.byMember[member.id] : undefined;
    const text = formatDigest({
      displayName: member.display_name,
      tasks: counts ? { open: counts.mine + counts.together, together: counts.together, overdue: countOverdueFor(tasks, member.id) } : null,
      meal: kcal ? { slot: kcal.firstMealSlot, kcal: kcal.firstMealKcal, dayKcal: kcal.kcal } : null,
      habitsPending: habits.ok ? pendingHabits(habits.data.habits, habits.data.checkins, member.id, today).length : null,
      money: money.ok
        ? {
            safeToSpend: money.data.safeToSpend,
            currency: money.data.currency,
            isDeficit: money.data.isDeficit,
            duePayments: money.data.due.length,
          }
        : null,
    });
    if (text) digests.push({ userId: member.user_id, ...text, url: "/app/dashboard" });
  }
  return digests;
}

/** Overdue items that concern this member (theirs or shared). */
function countOverdueFor(tasks: SummarySection<AgendaItem[]>, memberId: string): number {
  if (!tasks.ok) return 0;
  return tasks.data.filter(
    (i) => !i.done && i.overdue && (i.assigneeMemberId === null || i.assigneeMemberId === memberId),
  ).length;
}

/**
 * Short push text per household member for this morning. Uses only explicit
 * household filters (works with the service-role client, no auth.uid()).
 * Queries: 3 shared (members, households, settings) + 14 per household.
 * Members with nothing to say are skipped. Sends nothing itself.
 */
export async function buildMorningDigests(admin: AppSupabase, now: Date = new Date()): Promise<MorningDigest[]> {
  const membersResult = await fetchAllPages((from, to) =>
    admin
      .from("household_members")
      .select("id, user_id, household_id, display_name, joined_at")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (membersResult.error || !membersResult.data?.length) return [];

  const byHousehold = new Map<string, MemberRow[]>();
  for (const member of membersResult.data) {
    byHousehold.set(member.household_id, [...(byHousehold.get(member.household_id) ?? []), member]);
  }
  const householdIds = [...byHousehold.keys()];

  const [householdsResult, settingsResult] = await Promise.all([
    admin.from("households").select("id, base_currency").in("id", householdIds),
    // "*": safe_to_spend_reserves only exists after migration 13; one row per household.
    admin.from("household_settings").select("*").in("household_id", householdIds),
  ]);
  const currencyById = new Map((householdsResult.data ?? []).map((h) => [h.id, h.base_currency]));
  const settingsById = new Map(
    (settingsResult.data ?? []).map((s) => [s.household_id, s as unknown as Record<string, unknown>]),
  );

  const digests: MorningDigest[] = [];
  // One household at a time keeps concurrent DB load flat.
  for (const householdId of householdIds) {
    try {
      digests.push(
        ...(await householdDigests(admin, {
          householdId,
          baseCurrency: currencyById.get(householdId) ?? "EUR",
          settings: settingsById.get(householdId) ?? null,
          members: byHousehold.get(householdId)!,
          now,
        })),
      );
    } catch {
      // One broken household must not stop everyone else's morning push.
    }
  }
  return digests;
}
