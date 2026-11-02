/**
 * «Сводка на сегодня»: pure aggregation and text helpers shared by the
 * dashboard card and the morning push digest. No I/O here — loaders live in
 * services/summary-service.ts.
 */
import {
  dayStatus,
  isScheduled,
  weekCount,
  type CheckinMap,
  type HabitRules,
} from "@/lib/calculations/habits";
import { parseMoney, type MoneyInput } from "@/lib/calculations/money";
import { totalsByMember, ZERO_MACROS, type Macros, type Portion } from "@/lib/calculations/nutrition";
import type { AgendaItem } from "@/lib/calculations/task-schedule";
import { LOCALE } from "@/lib/locale";
import { SLOT_ORDER } from "@/lib/meals/labels";
import { pluralRu } from "@/lib/tasks/describe";
import type { MealSlot, Money } from "@/types/database";

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

/** A summary part either loaded or is unavailable («нет данных»). */
export type SummarySection<T> = { ok: true; data: T } | { ok: false };

export const UNAVAILABLE: SummarySection<never> = { ok: false };

/**
 * Run one loader; any error result or thrown error (e.g. a table missing
 * before its migration) becomes an unavailable section instead of failing
 * the whole summary.
 */
export async function settleSection<T>(
  load: () => Promise<{ data: T | null; error: unknown }>,
): Promise<SummarySection<T>> {
  try {
    const { data, error } = await load();
    if (error || data === null || data === undefined) return UNAVAILABLE;
    return { ok: true, data };
  } catch {
    return UNAVAILABLE;
  }
}

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export type TaskCounts = {
  /** Open items today plus open overdue one-offs. */
  open: number;
  done: number;
  overdue: number;
  /** Open items split by who they are for. */
  mine: number;
  together: number;
  partner: number;
};

/** Today's items (overdue first) from an agenda built for [today, today]. */
export function todayItems(agenda: { overdue: AgendaItem[]; byDate: Record<string, AgendaItem[]> }, today: string): AgendaItem[] {
  return [...agenda.overdue, ...(agenda.byDate[today] ?? [])];
}

export function countTasks(items: AgendaItem[], myMemberId: string): TaskCounts {
  const counts: TaskCounts = { open: 0, done: 0, overdue: 0, mine: 0, together: 0, partner: 0 };
  for (const item of items) {
    if (item.done) {
      counts.done += 1;
      continue;
    }
    counts.open += 1;
    if (item.overdue) counts.overdue += 1;
    if (item.assigneeMemberId === null) counts.together += 1;
    else if (item.assigneeMemberId === myMemberId) counts.mine += 1;
    else counts.partner += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export type SummaryMeal = { id: string; slot: MealSlot; title: string; position: number };

export type MemberKcal = {
  memberId: string;
  /** Planned kcal for the whole day. */
  kcal: number;
  /** kcal of the first meal of the day (breakfast if planned). */
  firstMealKcal: number;
  firstMealSlot: MealSlot | null;
  targetKcal: number | null;
};

export type MealsDay = {
  hasPlan: boolean;
  meals: SummaryMeal[];
  /** memberId → kcal summary (only members with portions or a target). */
  byMember: Record<string, MemberKcal>;
};

export function sortMeals<T extends { slot: MealSlot; position: number }>(meals: T[]): T[] {
  return [...meals].sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position,
  );
}

/** Day kcal per member vs targets, reusing the nutrition math. */
export function summarizeMealsDay(input: {
  hasPlan: boolean;
  meals: SummaryMeal[];
  portions: (Portion & { mealId: string })[];
  /** foodId → kcal per 100 g */
  kcalPer100g: Map<string, number>;
  targets: { member_id: string; kcal: number | null }[];
}): MealsDay {
  const foods = new Map<string, Macros>(
    [...input.kcalPer100g].map(([id, kcal]) => [id, { ...ZERO_MACROS, kcal }]),
  );
  const meals = sortMeals(input.meals);
  const byMember: Record<string, MemberKcal> = {};
  const entry = (memberId: string): MemberKcal =>
    (byMember[memberId] ??= { memberId, kcal: 0, firstMealKcal: 0, firstMealSlot: null, targetKcal: null });

  for (const meal of meals) {
    const totals = totalsByMember(
      input.portions.filter((p) => p.mealId === meal.id),
      foods,
    );
    for (const [memberId, macros] of totals) {
      const row = entry(memberId);
      row.kcal += macros.kcal;
      if (row.firstMealSlot === null && macros.kcal > 0) {
        row.firstMealSlot = meal.slot;
        row.firstMealKcal = macros.kcal;
      }
    }
  }
  for (const target of input.targets) {
    if (target.kcal !== null) entry(target.member_id).targetKcal = Number(target.kcal);
  }
  for (const row of Object.values(byMember)) {
    row.kcal = Math.round(row.kcal);
    row.firstMealKcal = Math.round(row.firstMealKcal);
  }
  return { hasPlan: input.hasPlan, meals, byMember };
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export type SummaryHabit = {
  id: string;
  title: string;
  emoji: string | null;
  /** null = for everyone */
  ownerMemberId: string | null;
  rules: HabitRules;
};

export type PendingHabit = { id: string; title: string; emoji: string | null };

/**
 * Habits this member still has to tick today: scheduled today and not done.
 * per_week habits count only while the weekly target is not reached.
 * `checkins`: habitId → memberId → date → value (this week is enough).
 */
export function pendingHabits(
  habits: SummaryHabit[],
  checkins: Map<string, Map<string, CheckinMap>>,
  memberId: string,
  today: string,
): PendingHabit[] {
  const out: PendingHabit[] = [];
  for (const habit of habits) {
    if (habit.ownerMemberId !== null && habit.ownerMemberId !== memberId) continue;
    if (!isScheduled(habit.rules, today)) continue;
    const map = checkins.get(habit.id)?.get(memberId) ?? new Map<string, number>();
    const status = dayStatus(habit.rules, map, today, today);
    if (status === "done" || status === "off") continue;
    if (habit.rules.frequency.kind === "per_week" && weekCount(habit.rules, map, today) >= habit.rules.frequency.times) {
      continue;
    }
    out.push({ id: habit.id, title: habit.title, emoji: habit.emoji });
  }
  return out;
}

export function groupCheckins(
  rows: { habit_id: string; member_id: string; checkin_date: string; value: MoneyInput }[],
): Map<string, Map<string, CheckinMap>> {
  const out = new Map<string, Map<string, CheckinMap>>();
  for (const row of rows) {
    const byMember = out.get(row.habit_id) ?? new Map<string, CheckinMap>();
    const byDate = byMember.get(row.member_id) ?? new Map<string, number>();
    byDate.set(row.checkin_date, Number(row.value));
    byMember.set(row.member_id, byDate);
    out.set(row.habit_id, byMember);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type DuePayment = { name: string; amount: Money; currency: string; date: string; overdue: boolean };

export type MoneyDay = {
  currency: string;
  safeToSpend: Money;
  isDeficit: boolean;
  /** Expense obligations dated today or earlier that are still open. */
  due: DuePayment[];
  dueToday: number;
  overdue: number;
};

/** Pick the household currency's STS and the payments due by today from forecast output. */
export function summarizeMoney(input: {
  baseCurrency: string;
  today: string;
  currencies: { currency: string; safeToSpend: Money; isDeficit: boolean }[];
  obligations: { name: string; amount: Money; currency: string; date: string; cashFlow: "income" | "expense" }[];
}): MoneyDay | null {
  const base = input.baseCurrency.toUpperCase();
  const row = input.currencies.find((c) => c.currency.toUpperCase() === base) ?? input.currencies[0];
  if (!row) return null;
  const due = input.obligations
    .filter((e) => e.cashFlow === "expense" && e.date <= input.today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ name: e.name, amount: e.amount, currency: e.currency, date: e.date, overdue: e.date < input.today }));
  const overdue = due.filter((d) => d.overdue).length;
  return {
    currency: row.currency,
    safeToSpend: row.safeToSpend,
    isDeficit: row.isDeficit,
    due,
    dueToday: due.length - overdue,
    overdue,
  };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const tasksWord = (n: number) => pluralRu(n, "дело", "дела", "дел");
export const habitsWord = (n: number) => pluralRu(n, "привычка", "привычки", "привычек");
export const paymentsWord = (n: number) => pluralRu(n, "платёж", "платежа", "платежей");

const SLOT_GENITIVE_SHORT: Record<MealSlot, string> = {
  breakfast: "завтрак",
  lunch: "обед",
  dinner: "ужин",
  snack: "перекус",
};

/** Whole-unit money for short texts: "85 €", "−20 €". */
export function shortMoney(value: MoneyInput, currency: string): string {
  const amount = Math.round(Number(parseMoney(value)) / 100);
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** One member's view of the day, as needed for the push text. */
export type DigestInput = {
  displayName: string | null;
  tasks: { open: number; together: number; overdue: number } | null;
  meal: { slot: MealSlot | null; kcal: number; dayKcal: number } | null;
  habitsPending: number | null;
  money: { safeToSpend: Money; currency: string; isDeficit: boolean; duePayments: number } | null;
};

export const DIGEST_BODY_MAX = 160;

/** Whether there is anything worth a push (money alone is not news). */
export function hasDigestNews(input: DigestInput): boolean {
  return Boolean(
    (input.tasks && input.tasks.open > 0) ||
      (input.habitsPending && input.habitsPending > 0) ||
      (input.meal && input.meal.dayKcal > 0) ||
      (input.money && input.money.duePayments > 0),
  );
}

/** Parts of the push body, most important first. */
export function digestParts(input: DigestInput): string[] {
  const parts: string[] = [];
  if (input.tasks && input.tasks.open > 0) {
    const extras: string[] = [];
    if (input.tasks.together > 0) extras.push(`${input.tasks.together} вместе`);
    if (input.tasks.overdue > 0) extras.push(`${input.tasks.overdue} просроч.`);
    parts.push(
      `${input.tasks.open} ${tasksWord(input.tasks.open)}${extras.length ? ` (${extras.join(", ")})` : ""}`,
    );
  }
  if (input.money && input.money.duePayments > 0) {
    parts.push(`${input.money.duePayments} ${paymentsWord(input.money.duePayments)} к оплате`);
  }
  if (input.meal && input.meal.dayKcal > 0) {
    parts.push(
      input.meal.slot && input.meal.kcal > 0
        ? `${SLOT_GENITIVE_SHORT[input.meal.slot]} ${input.meal.kcal} ккал`
        : `${input.meal.dayKcal} ккал за день`,
    );
  }
  if (input.habitsPending && input.habitsPending > 0) {
    parts.push(`${input.habitsPending} ${habitsWord(input.habitsPending)}`);
  }
  if (input.money) {
    parts.push(
      input.money.isDeficit
        ? `денег впритык: ${shortMoney(input.money.safeToSpend, input.money.currency)}`
        : `можно потратить ${shortMoney(input.money.safeToSpend, input.money.currency)}`,
    );
  }
  return parts;
}

/** Join parts with « · », dropping the least important ones to fit `max`. */
export function joinWithin(parts: string[], max = DIGEST_BODY_MAX): string {
  const kept = [...parts];
  while (kept.length > 1 && kept.join(" · ").length > max) kept.pop();
  const text = kept.join(" · ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function digestTitle(displayName: string | null): string {
  return displayName ? `Доброе утро, ${displayName}! ☀️` : "Доброе утро! ☀️";
}

export function formatDigest(input: DigestInput): { title: string; body: string } | null {
  if (!hasDigestNews(input)) return null;
  return { title: digestTitle(input.displayName), body: joinWithin(digestParts(input)) };
}

/** Prefilled question for «Спросить Морти». */
export const ASK_MORTY_TODAY =
  "Что у нас сегодня? Посмотри дела, питание, привычки и деньги и помоги спланировать день.";

export function askMortyHref(question = ASK_MORTY_TODAY): string {
  return `/app/assistant?q=${encodeURIComponent(question)}`;
}
